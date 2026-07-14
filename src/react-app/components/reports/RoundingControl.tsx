import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Rounding, RoundMode } from "@/hooks/useReports";

const MODES: { value: RoundMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "nearest", label: "Nearest" },
  { value: "up", label: "Round up" },
  { value: "down", label: "Round down" },
];

const INCREMENTS = [1, 5, 6, 10, 15, 30, 60];

interface RoundingControlProps {
  value: Rounding;
  onChange: (r: Rounding) => void;
}

export function RoundingControl({ value, onChange }: RoundingControlProps) {
  const active = value.mode !== "off";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={active ? "h-8 gap-1.5 text-sm" : "h-8 gap-1.5 text-sm text-muted-foreground"}
        >
          <Clock3 className="h-3.5 w-3.5" />
          Rounding
          {active && (
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 tabular-nums">
              {value.minutes}m
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-3" align="end">
        <div className="space-y-1.5">
          <Label className="text-xs">Mode</Label>
          <Select
            value={value.mode}
            onValueChange={(v) => onChange({ ...value, mode: v as RoundMode })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Increment (minutes)</Label>
          <Select
            value={String(value.minutes)}
            onValueChange={(v) => onChange({ ...value, minutes: Number(v) })}
            disabled={value.mode === "off"}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INCREMENTS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Rounds each entry's duration before totals are calculated.
        </p>
      </PopoverContent>
    </Popover>
  );
}
