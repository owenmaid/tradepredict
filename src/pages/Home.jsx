import { useState } from "react";
import { base44 } from "@/api/base44Client";
import ScreenControls from "@/components/ScreenControls";
import StockRow from "@/components/StockRow";
import StockDetail from "@/components/StockDetail";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, ShieldAlert, ListChecks } from "lucide-react";

export default function Home() {
  const [screen, setScreen] = useState("mega_tech");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  async function runScreen() {
    setLoading(true);
    setError(null);
    setResults(null);
    setMeta(null);
    try {
      const res = await base44.functions.invoke("ibkrScreen", { screen });
      const data = res.data;
      if (data.error) {
        setError(data.error);
      } else if (data.configured === false || data.authenticated === false || data.reachable === false) {
        setError(data.message);
      } else {
        setResults(data.results || []);
        setMeta({ screenLabel: data.screenLabel, runAt: data.runAt, count: data.count, skipped: data.skipped || [] });
        if ((data.results || []).length === 0 && (data.skipped || []).length > 0) {
          setError(`No shares could be scored. First problem: ${data.skipped[0].symbol} — ${data.skipped[0].reason}`);
        } else if ((data.results || []).length === 0) {
          setError("No scored results came back. Check that your IBKR account has market-data subscriptions for these exchanges and that the bridge's IBKR session is authenticated.");
        }
      }
    } catch (e) {
      setError(e?.message || "Failed to run the screen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <LineChart className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">TradePredict</h1>
              <p className="text-sm text-muted-foreground">Likelihood-ranked share screen from live IBKR data</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="font-medium">Run a market screen</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pick a universe, run it, and see each share ranked by its likelihood of moving up or down — with the technicals and an AI rationale behind the call.
              </p>
            </div>
            <ScreenControls screen={screen} onScreenChange={setScreen} onRun={runScreen} loading={loading} />
          </CardContent>
        </Card>

        {error && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-4">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-200">{error}</p>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!loading && results && results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ListChecks className="h-4 w-4" />
                <span>{meta?.screenLabel} · {results.length} ranked</span>
              </div>
              {meta?.runAt && (
                <span className="text-xs text-muted-foreground">Updated {new Date(meta.runAt).toLocaleString()}</span>
              )}
            </div>
            {meta?.skipped?.length > 0 && (
              <details className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  {meta.skipped.length} {meta.skipped.length === 1 ? "share" : "shares"} could not be scored
                </summary>
                <ul className="mt-2 space-y-1">
                  {meta.skipped.map((s) => (
                    <li key={s.symbol}>
                      <span className="font-medium text-foreground">{s.symbol}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {results.map((s, idx) => (
              <StockRow key={s.conid || s.symbol} stock={s} rank={idx + 1} onClick={() => setSelected(s)} />
            ))}
          </div>
        )}

        {!loading && !results && !error && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">Choose a screen and run it to see ranked opportunities.</p>
          </div>
        )}
      </main>

      <StockDetail stock={selected} onClose={() => setSelected(null)} />
    </div>
  );
}