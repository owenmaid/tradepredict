"""
TradePredict IBKR bridge.

A small, always-on service that holds the authenticated IBKR session and exposes
a locked-down subset of the IBKR Web API to the Base44 backend function.

Why it exists:
  * Base44 functions are short-lived and can't keep an IBKR session alive.
  * The Client Portal Gateway must never be exposed to the internet directly:
    anyone reaching it would be using your logged-in brokerage session.

Every request must carry the shared secret in the `x-api-key` header, and only
the read-only endpoints listed in ALLOWED_PATHS are forwarded. Trading endpoints
are deliberately NOT allowed yet.

Modes (IBKR_MODE env var):
  oauth    - OAuth 1.0a self-service credentials, calls api.ibkr.com directly.
             No gateway and no daily browser login. (Recommended.)
  gateway  - Forwards to a Client Portal Gateway running next to this service
             (e.g. https://localhost:5000). Needs a daily 2FA login.
"""

import hmac
import logging
import os
import re
import threading

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from ibind import IbkrClient
from ibind.support.errors import ExternalBrokerError

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
log = logging.getLogger("bridge")

BRIDGE_API_KEY = os.environ.get("BRIDGE_API_KEY", "")
if len(BRIDGE_API_KEY) < 32:
    raise RuntimeError("BRIDGE_API_KEY must be set to a random string of at least 32 characters.")

MODE = os.environ.get("IBKR_MODE", "oauth").lower()
if MODE not in ("oauth", "gateway"):
    raise RuntimeError("IBKR_MODE must be 'oauth' or 'gateway'.")

# Read-only endpoints the Base44 app is allowed to reach. Paths are relative to /v1/api/.
ALLOWED_PATHS = [
    ("GET", r"iserver/auth/status"),
    ("POST", r"iserver/auth/status"),
    ("GET", r"iserver/accounts"),
    ("GET", r"tickle"),
    ("POST", r"tickle"),
    ("GET", r"trsrv/stocks"),
    ("GET", r"iserver/secdef/search"),
    ("POST", r"iserver/secdef/search"),
    ("GET", r"iserver/marketdata/history"),
    ("GET", r"iserver/marketdata/snapshot"),
]
_ALLOWED = [(m, re.compile(rf"^{p}$")) for m, p in ALLOWED_PATHS]

_client = None
_client_lock = threading.Lock()


def get_client() -> IbkrClient:
    """Create the IBKR client lazily so the service can start (and report health) before IBKR is reachable."""
    global _client
    with _client_lock:
        if _client is None:
            if MODE == "oauth":
                # Reads IBIND_OAUTH1A_* env vars; starts its own keep-alive tickler.
                _client = IbkrClient(use_oauth=True)
            else:
                url = os.environ.get("IBKR_GATEWAY_URL", "https://localhost:5000/v1/api/")
                if not url.endswith("/"):
                    url += "/"
                # The gateway uses a self-signed cert on localhost, so verification is off for that hop only.
                _client = IbkrClient(url=url, cacert=os.environ.get("IBKR_GATEWAY_CACERT", False))
                _client.start_tickler()
            log.info("IBKR client ready (mode=%s)", MODE)
        return _client


def check_key(x_api_key: str | None):
    if not x_api_key or not hmac.compare_digest(x_api_key, BRIDGE_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing x-api-key")


app = FastAPI(title="TradePredict IBKR bridge", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health(x_api_key: str | None = Header(default=None)):
    check_key(x_api_key)
    try:
        status = get_client().get("iserver/auth/status").data
        return {"ok": True, "mode": MODE, "ibkr": status}
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"ok": False, "mode": MODE, "error": str(e)}, status_code=503)


@app.api_route("/v1/api/{path:path}", methods=["GET", "POST"])
async def proxy(path: str, request: Request, x_api_key: str | None = Header(default=None)):
    check_key(x_api_key)
    method = request.method
    if not any(m == method and rx.match(path) for m, rx in _ALLOWED):
        raise HTTPException(status_code=403, detail=f"{method} {path} is not allowed through this bridge")

    try:
        client = await run_in_threadpool(get_client)
        if method == "GET":
            result = await run_in_threadpool(client.get, path, dict(request.query_params) or None)
        else:
            body = await request.json() if (await request.body()) else None
            result = await run_in_threadpool(client.post, path, body)
        return JSONResponse(result.data if result.data is not None else {})
    except ExternalBrokerError as e:
        code = e.status_code or 502
        log.warning("IBKR error %s on %s %s: %s", code, method, path, e)
        return JSONResponse({"error": str(e)}, status_code=code)
    except Exception as e:  # noqa: BLE001
        log.exception("Bridge failure on %s %s", method, path)
        return JSONResponse({"error": str(e)}, status_code=502)
