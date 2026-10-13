import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';

// Curated market screens. Each is a universe of liquid US tickers resolved to
// IBKR contract ids at runtime. This is a reliable stand-in for IBKR's scanner
// endpoint and keeps the call volume bounded.
const SCREENS: Record<string, { label: string; tickers: string[] }> = {
  mega_tech: { label: 'Mega-cap tech', tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX', 'AVGO', 'ADBE'] },
  semis: { label: 'Semiconductors', tickers: ['NVDA', 'AMD', 'AVGO', 'INTC', 'QCOM', 'TXN', 'MU', 'AMAT', 'LRCX', 'MRVL'] },
  finance: { label: 'Financials', tickers: ['JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'BLK', 'SCHW', 'AXP', 'V'] },
  energy: { label: 'Energy', tickers: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'PSX', 'MPC', 'VLO', 'DVN'] },
  sp500_sample: {
    label: 'S&P 500 sample',
    tickers: ['AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA', 'JPM', 'V', 'JNJ', 'WMT', 'PG', 'UNH', 'HD', 'MA', 'DIS', 'BAC', 'XOM', 'CVX', 'PFE', 'KO', 'PEP', 'MRK', 'ABBV', 'NFLX', 'ADBE', 'CRM', 'INTC', 'AMD', 'CSCO']
  }
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function emaSeries(vals: number[], period: number): number[] {
  if (vals.length < period) return [];
  const k = 2 / (period + 1);
  let e = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [e];
  for (let i = period; i < vals.length; i++) {
    e = vals[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

function sma(vals: number[], period: number): number | null {
  if (vals.length < period) return null;
  return vals.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gains += ch; else losses -= ch;
  }
  const avgG = gains / period;
  const avgL = losses / period;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

function analyze(closes: number[]) {
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2] ?? last;
  const changePct = prev ? ((last - prev) / prev) * 100 : 0;

  const rsiVal = rsi(closes);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);

  // MACD: 12/26 EMA difference, 9-period signal line.
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  let macdLine: number | null = null;
  let signal: number | null = null;
  if (e12.length && e26.length) {
    const offset = e12.length - e26.length;
    const macdArr = e26.map((v, i) => e12[i + offset] - v);
    macdLine = macdArr[macdArr.length - 1];
    const sigSeries = emaSeries(macdArr, 9);
    signal = sigSeries.length ? sigSeries[sigSeries.length - 1] : null;
  }

  const mom = closes.length > 20 ? ((last - closes[closes.length - 21]) / closes[closes.length - 21]) * 100 : 0;

  // Each component maps to a 0-100 "likelihood of going up" reading.
  const rsiComp = rsiVal == null ? 50 : clamp(50 + (50 - rsiVal), 0, 100); // oversold -> higher
  const macdComp = macdLine != null && signal != null ? clamp(50 + ((macdLine - signal) / Math.abs(last)) * 1000, 0, 100) : 50;
  const trendComp = sma50 ? clamp(50 + ((last - sma50) / sma50) * 100 * 5, 0, 100) : 50;
  const momComp = clamp(50 + mom * 3, 0, 100);

  const score = Math.round(0.25 * rsiComp + 0.25 * macdComp + 0.3 * trendComp + 0.2 * momComp);
  const direction = score >= 60 ? 'up' : score <= 40 ? 'down' : 'neutral';

  return {
    lastPrice: last,
    changePct,
    score,
    direction,
    indicators: {
      rsi: rsiVal != null ? Math.round(rsiVal * 10) / 10 : null,
      macd: macdLine != null ? Math.round(macdLine * 100) / 100 : null,
      macdSignal: signal != null ? Math.round(signal * 100) / 100 : null,
      sma20: sma20 != null ? Math.round(sma20 * 100) / 100 : null,
      sma50: sma50 != null ? Math.round(sma50 * 100) / 100 : null,
      momentumPct: Math.round(mom * 100) / 100
    }
  };
}

const US_EXCHANGES = ['NASDAQ', 'NYSE', 'ARCA', 'AMEX', 'BATS', 'NYSE ARCA', 'NYSEAMERICAN'];
const HISTORY_CONCURRENCY = 4; // IBKR allows 5 concurrent /marketdata/history requests
const SEARCH_CONCURRENCY = 3; // stay well under IBKR's ~10 req/s global limit

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Runs `fn` over `items` with at most `limit` calls in flight.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function makeIbkr(base: string, apiKey: string) {
  // Calls the TradePredict bridge, which forwards to IBKR. Retries on rate limiting (429).
  return async function ibkr(path: string, attempt = 0): Promise<any> {
    const res = await fetch(`${base}/v1/api/${path}`, {
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (res.status === 429 && attempt < 2) {
      await sleep(1500 * (attempt + 1));
      return ibkr(path, attempt + 1);
    }
    if (res.status === 401) throw new Error('Bridge rejected the API key. Check that IBKR_BRIDGE_KEY matches BRIDGE_API_KEY on the bridge.');
    if (!res.ok) throw new Error(`IBKR ${res.status}: ${String(body?.error ?? text).slice(0, 200)}`);
    return body;
  };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const bridgeUrl = secrets.get('IBKR_BRIDGE_URL');
    const bridgeKey = secrets.get('IBKR_BRIDGE_KEY');
    if (!bridgeUrl || !bridgeKey) {
      return Response.json({
        configured: false,
        message: 'IBKR bridge not configured. Deploy the service in the /bridge folder of this repo, then add IBKR_BRIDGE_URL and IBKR_BRIDGE_KEY in the app dashboard Secrets. (Calling the Client Portal Gateway directly is no longer supported because it exposes your brokerage session without authentication.)'
      });
    }
    if (!bridgeUrl.startsWith('https://')) {
      return Response.json({ configured: false, message: 'IBKR_BRIDGE_URL must start with https:// so the API key is never sent in clear text.' });
    }

    const body = await req.json().catch(() => ({}));
    const screenId: string = body.screen && SCREENS[body.screen] ? body.screen : 'mega_tech';
    const screen = SCREENS[screenId];
    const ibkr = makeIbkr(bridgeUrl.replace(/\/$/, ''), bridgeKey);
    const skipped: { symbol: string; reason: string }[] = [];

    // 1. Confirm the IBKR session is authenticated.
    try {
      const status = await ibkr('iserver/auth/status');
      if (status && status.authenticated === false) {
        return Response.json({
          configured: true,
          authenticated: false,
          message: 'The bridge is reachable but its IBKR session is not authenticated. With OAuth, check the bridge logs; with the Client Portal Gateway, complete the 2FA login, then re-run the screen.'
        });
      }
    } catch (e) {
      return Response.json({ configured: true, reachable: false, message: `Could not reach the IBKR bridge: ${(e as Error).message}` });
    }

    // IBKR expects /iserver/accounts once per session before market-data calls work reliably.
    await ibkr('iserver/accounts').catch(() => null);

    // 2. Resolve tickers to US stock contract ids in one call.
    type Resolved = { ticker: string; conid: string; company: string };
    const resolved: Resolved[] = [];
    let stocks: Record<string, any[]> = {};
    try {
      stocks = (await ibkr(`trsrv/stocks?symbols=${encodeURIComponent(screen.tickers.join(','))}`)) ?? {};
    } catch { stocks = {}; }

    const unresolved: string[] = [];
    for (const ticker of screen.tickers) {
      const entries: any[] = stocks[ticker] ?? [];
      let match: Resolved | null = null;
      for (const entry of entries) {
        if (entry.assetClass && entry.assetClass !== 'STK') continue;
        const contract = (entry.contracts ?? []).find((c: any) => c.isUS && c.conid);
        if (contract) { match = { ticker, conid: String(contract.conid), company: entry.name ?? ticker }; break; }
      }
      if (match) resolved.push(match); else unresolved.push(ticker);
    }

    // Fallback: symbol search (by ticker, not company name), throttled.
    const fallback = await mapLimit(unresolved, SEARCH_CONCURRENCY, async (ticker) => {
      try {
        const data = await ibkr(`iserver/secdef/search?symbol=${encodeURIComponent(ticker)}&secType=STK`);
        const list: any[] = Array.isArray(data) ? data : data?.data ?? [];
        const exact = list.filter((c) => c.conid && String(c.symbol ?? ticker).toUpperCase() === ticker);
        const hit = exact.find((c) => US_EXCHANGES.includes(String(c.description ?? '').toUpperCase())) ?? exact[0];
        if (!hit) { skipped.push({ symbol: ticker, reason: 'No US stock contract found' }); return null; }
        return { ticker, conid: String(hit.conid), company: hit.companyName ?? ticker };
      } catch (e) {
        skipped.push({ symbol: ticker, reason: `Lookup failed: ${(e as Error).message}` });
        return null;
      }
    });
    for (const r of fallback) if (r) resolved.push(r);

    // 3. Fetch daily history, never more than HISTORY_CONCURRENCY at once.
    const histories = await mapLimit(resolved, HISTORY_CONCURRENCY, async (r) => {
      try {
        const data = await ibkr(`iserver/marketdata/history?conid=${r.conid}&period=6m&bar=1d&outsideRth=true`);
        const bars: any[] = data?.data ?? [];
        return bars.map((b) => ({ t: b.t, c: b.c })).filter((b) => typeof b.c === 'number');
      } catch (e) {
        skipped.push({ symbol: r.ticker, reason: `History failed: ${(e as Error).message}` });
        return null;
      }
    });

    const results: any[] = [];
    histories.forEach((h, idx) => {
      const r = resolved[idx];
      if (!h) return;
      if (h.length < 30) {
        skipped.push({ symbol: r.ticker, reason: `Only ${h.length} days of history (need 30+)` });
        return;
      }
      const closes = h.map((b) => b.c);
      results.push({
        symbol: r.ticker,
        conid: r.conid,
        company: r.company,
        ...analyze(closes),
        history: h.slice(-60)
      });
    });

    results.sort((a, b) => b.score - a.score);

    // 4. AI rationale for the top picks.
    const top = results.slice(0, 5);
    let analyses: Record<string, any> = {};
    if (top.length) {
      const prompt = `You are a concise equity markets analyst. For each stock below, assess whether it is more likely to move UP or DOWN over the next few sessions based strictly on the provided technical readings, and give a 1-2 sentence rationale plus a confidence score (0-100). Do not invent data.

Stocks:
${top.map((s) => `- ${s.symbol} (${s.company}): last ${s.lastPrice}, day change ${s.changePct.toFixed(2)}%, RSI ${s.indicators.rsi}, MACD ${s.indicators.macd} vs signal ${s.indicators.macdSignal}, SMA20 ${s.indicators.sma20}, SMA50 ${s.indicators.sma50}, 20-day momentum ${s.indicators.momentumPct}%, model score ${s.score}/100 (${s.direction})`).join('\n')}

Return JSON with an "analyses" array, one entry per symbol.`;
      const llm = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            analyses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  symbol: { type: 'string' },
                  rationale: { type: 'string' },
                  confidence: { type: 'number' }
                },
                required: ['symbol', 'rationale', 'confidence']
              }
            }
          },
          required: ['analyses']
        }
      });
      const arr: any[] = (llm as any)?.analyses ?? [];
      analyses = Object.fromEntries(arr.map((a) => [String(a.symbol).toUpperCase(), a]));
    }

    const finalResults = results.map((r) => {
      const ai = analyses[r.symbol];
      return { ...r, rationale: ai?.rationale ?? null, aiConfidence: ai?.confidence ?? null };
    });

    return Response.json({
      configured: true,
      authenticated: true,
      screen: screenId,
      screenLabel: screen.label,
      runAt: new Date().toISOString(),
      count: finalResults.length,
      results: finalResults,
      skipped,
      disclaimer: 'Educational tool only. Scores are a technical heuristic, not investment advice.'
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}