"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (range: { startDate: string; endDate: string }) => void;
}

const PRESETS = [
  { label: "7g", days: 7 },
  { label: "30g", days: 30 },
  { label: "90g", days: 90 },
  { label: "1a", days: 365 },
] as const;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: DateRangePickerProps) {
  const handlePreset = (days: number) => {
    onChange({ startDate: daysAgo(days), endDate: today() });
  };

  const handleAll = () => {
    onChange({ startDate: "2020-01-01", endDate: today() });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={startDate}
          onChange={(e) =>
            onChange({ startDate: e.target.value, endDate })
          }
          className="h-8 w-[140px] text-xs"
        />
        <span className="text-xs text-muted-foreground">al</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) =>
            onChange({ startDate, endDate: e.target.value })
          }
          className="h-8 w-[140px] text-xs"
        />
      </div>
      <div className="flex items-center gap-1">
        {PRESETS.map(({ label, days }) => {
          const isActive =
            startDate === daysAgo(days) && endDate === today();
          return (
            <Button
              key={label}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={cn("h-7 px-2.5 text-xs")}
              onClick={() => handlePreset(days)}
            >
              {label}
            </Button>
          );
        })}
        <Button
          variant={startDate === "2020-01-01" ? "default" : "outline"}
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={handleAll}
        >
          Tutto
        </Button>
      </div>
    </div>
  );
}
