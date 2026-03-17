"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface MetricTooltipProps {
  content: string;
}

export function MetricTooltip({ content }: MetricTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help inline-block ml-1" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-sm">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
