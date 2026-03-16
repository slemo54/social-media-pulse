"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AnomalyBadgeProps {
  episodeDownloads: number;
  seriesAvgDownloads: number;
}

/**
 * Shows a badge if an episode performs >1.5x (overperformer)
 * or <0.5x (underperformer) relative to the series average.
 */
export function AnomalyBadge({ episodeDownloads, seriesAvgDownloads }: AnomalyBadgeProps) {
  if (seriesAvgDownloads <= 0) return null;

  const ratio = episodeDownloads / seriesAvgDownloads;

  if (ratio > 1.5) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              className="text-xs cursor-default bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
              variant="outline"
            >
              🔥 Overperformer
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {ratio.toFixed(1)}x series average ({episodeDownloads.toLocaleString()} vs avg {Math.round(seriesAvgDownloads).toLocaleString()})
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (ratio < 0.5) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              className="text-xs cursor-default bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/20"
              variant="outline"
            >
              📉 Underperformer
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {ratio.toFixed(1)}x series average ({episodeDownloads.toLocaleString()} vs avg {Math.round(seriesAvgDownloads).toLocaleString()})
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return null;
}
