import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Loader2 } from "lucide-react";

const SCREENS = [
  { id: "mega_tech", label: "Mega-cap tech" },
  { id: "semis", label: "Semiconductors" },
  { id: "finance", label: "Financials" },
  { id: "energy", label: "Energy" },
  { id: "sp500_sample", label: "S&P 500 sample" }
];

export default function ScreenControls({ screen, onScreenChange, onRun, loading }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
      <Select value={screen} onValueChange={onScreenChange} disabled={loading}>
        <SelectTrigger className="w-full sm:w-64">
          <SelectValue placeholder="Choose a screen" />
        </SelectTrigger>
        <SelectContent>
          {SCREENS.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={onRun} disabled={loading} className="w-full sm:w-auto">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {loading ? "Running screen…" : "Run screen"}
      </Button>
    </div>
  );
}