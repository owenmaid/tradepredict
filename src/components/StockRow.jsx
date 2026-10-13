import { ChevronRight, Sparkles } from "lucide-react";
import ScoreBadge from "./ScoreBadge";
import { cn } from "@/lib/utils";

function Indicator({ label, value, tone }) {
  const toneClass = tone === "up" ? "text-emerald-600 dark:text-emerald-400" : tone === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium tabular-nums", toneClass)}>{value}</span>
    </div>
  );
}

export default function StockRow({ stock, rank, onClick }) {
  const i = stock.indicators;
  const changeTone = stock.changePct >= 0 ? "up" : "down";
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-border bg-card p-4 hover:shadow-sm hover:border-primary/30 transition focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-5">{rank}</span>
            <span className="font-semibold text-base">{stock.symbol}</span>
            <span className={cn("text-xs font-medium tabular-nums", changeTone === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {stock.changePct >= 0 ? "+" : ""}{stock.changePct.toFixed(2)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate ml-7">{stock.company}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ScoreBadge score={stock.score} direction={stock.direction} />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div className="mt-3 ml-7 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Indicator label="Last" value={`$${Number(stock.lastPrice).toFixed(2)}`} />
        <Indicator label="RSI" value={i.rsi ?? "—"} tone={i.rsi == null ? null : i.rsi < 35 ? "up" : i.rsi > 65 ? "down" : null} />
        <Indicator label="MACD" value={i.macd != null ? (i.macd >= 0 ? "+" : "") + i.macd.toFixed(2) : "—"} tone={i.macd == null ? null : i.macd > (i.macdSignal ?? 0) ? "up" : "down"} />
        <Indicator label="vs SMA50" value={i.sma50 != null ? `${(((stock.lastPrice - i.sma50) / i.sma50) * 100).toFixed(1)}%` : "—"} tone={i.sma50 == null ? null : stock.lastPrice >= i.sma50 ? "up" : "down"} />
        <Indicator label="20d mom" value={`${i.momentumPct >= 0 ? "+" : ""}${i.momentumPct.toFixed(1)}%`} tone={i.momentumPct >= 0 ? "up" : "down"} />
      </div>

      {stock.rationale && (
        <div className="mt-3 ml-7 flex gap-2 rounded-lg bg-muted/50 p-2.5">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {stock.rationale}
            {stock.aiConfidence != null && <span className="ml-1 font-medium text-foreground">· AI confidence {stock.aiConfidence}/100</span>}
          </p>
        </div>
      )}
    </button>
  );
}