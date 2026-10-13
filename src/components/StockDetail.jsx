import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Sparkles } from "lucide-react";
import ScoreBadge from "./ScoreBadge";

function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums mt-0.5">{value ?? "—"}</div>
    </div>
  );
}

export default function StockDetail({ stock, onClose }) {
  if (!stock) return null;
  const i = stock.indicators;
  const data = (stock.history || []).map((h) => ({
    date: new Date(h.t).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    price: h.c
  }));

  return (
    <Dialog open={!!stock} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle className="text-xl">{stock.symbol}</DialogTitle>
              <DialogDescription>{stock.company}</DialogDescription>
            </div>
            <ScoreBadge score={stock.score} direction={stock.direction} />
          </div>
        </DialogHeader>

        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold tabular-nums">${Number(stock.lastPrice).toFixed(2)}</span>
          <span className={`text-sm font-medium tabular-nums ${stock.changePct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {stock.changePct >= 0 ? "+" : ""}{stock.changePct.toFixed(2)}% today
          </span>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={48} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`$${Number(v).toFixed(2)}`, "Close"]}
              />
              <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Field label="RSI (14)" value={i.rsi} />
          <Field label="MACD" value={i.macd != null ? `${i.macd >= 0 ? "+" : ""}${i.macd.toFixed(2)}` : null} />
          <Field label="MACD signal" value={i.macdSignal != null ? i.macdSignal.toFixed(2) : null} />
          <Field label="SMA 20" value={i.sma20 != null ? `$${i.sma20.toFixed(2)}` : null} />
          <Field label="SMA 50" value={i.sma50 != null ? `$${i.sma50.toFixed(2)}` : null} />
          <Field label="20-day momentum" value={`${i.momentumPct >= 0 ? "+" : ""}${i.momentumPct.toFixed(1)}%`} />
        </div>

        {stock.rationale && (
          <div className="flex gap-2 rounded-lg bg-muted/60 p-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">{stock.rationale}</p>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Educational tool only. Scores are a technical heuristic, not investment advice.
        </p>
      </DialogContent>
    </Dialog>
  );
}