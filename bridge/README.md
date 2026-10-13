# IBKR bridge

A small service that keeps the IBKR session alive and lets the Base44 `ibkrScreen`
function reach it safely. It is **not** part of the Base44 build; deploy it separately
(Railway, Fly.io, Render or a small VPS).

```
Base44 function ──HTTPS + x-api-key──▶ bridge ──OAuth 1.0a──▶ api.ibkr.com
                                          └──or──▶ Client Portal Gateway (localhost)
```

## What it allows

Only read-only market-data endpoints are forwarded (see `ALLOWED_PATHS` in `main.py`).
Order placement is blocked on purpose until the trading features are added.
Every request needs the `x-api-key` header.

## Setup

1. **IBKR credentials.** Use the OAuth 1.0a self-service portal (needs an IBKR Pro account)
   and follow the [ibind OAuth guide](https://github.com/Voyz/ibind/wiki/OAuth-1.0a).
   Generate a separate set for your **paper** account and start with that.
2. **Configure.** Copy `env.example`, fill it in, and set the values as environment
   variables on your host. Never commit real keys.
3. **Deploy** with the included `Dockerfile`. The host must give you an HTTPS URL.
4. **Check it:**
   ```bash
   curl -H "x-api-key: $BRIDGE_API_KEY" https://your-bridge.example.com/health
   ```
   You want `"ok": true` and `"authenticated": true` in the IBKR status.
5. **Base44 Secrets** (Dashboard → Settings → Secrets):
   - `IBKR_BRIDGE_URL` = `https://your-bridge.example.com`
   - `IBKR_BRIDGE_KEY` = the same value as `BRIDGE_API_KEY`
   - You can delete the old `IBKR_GATEWAY_URL` secret.

## Gateway mode

If you'd rather run the Client Portal Gateway, set `IBKR_MODE=gateway` and run the
bridge on the same machine as the gateway. Keep the gateway itself bound to localhost;
only the bridge should be reachable from outside. You'll still need to log in with 2FA
each day.

## Run locally

```bash
pip install -r requirements.txt
export $(grep -v '^#' .env | xargs)
uvicorn main:app --port 8080
```
