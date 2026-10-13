import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ScoreBadge({ score, direction, size = "md" }) {
  const dir = direction || (score >= 60 ? "up" : score <= 40 ? "down" : "neutral");
  const styles = {
    up: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    down: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
    neutral: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
  };
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border font-semibold", pad, styles[dir])}>
      <Icon className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
      {score}/100
    </span>
  );
}