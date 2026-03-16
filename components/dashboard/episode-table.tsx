"use client";

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatNumber } from "@/lib/utils";

interface EpisodeRow {
  id: string;
  title: string;
  series?: string | null;
  publish_date?: string | null;
  downloads?: number | null;
  views?: number | null;
}

interface EpisodeTableProps {
  episodes: EpisodeRow[];
  loading?: boolean;
  onSort?: (column: string) => void;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

function SortIcon({
  column,
  sortBy,
  sortDir,
}: {
  column: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}) {
  if (sortBy !== column) {
    return <ArrowUpDown className="ml-1 h-3 w-3 inline" />;
  }
  return sortDir === "asc" ? (
    <ArrowUp className="ml-1 h-3 w-3 inline" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3 inline" />
  );
}

export function EpisodeTable({
  episodes,
  loading = false,
  onSort,
  sortBy,
  sortDir,
}: EpisodeTableProps) {
  const sortableHeader = (label: string, column: string) => (
    <button
      className="flex items-center hover:text-foreground transition-colors"
      onClick={() => onSort?.(column)}
    >
      {label}
      <SortIcon column={column} sortBy={sortBy} sortDir={sortDir} />
    </button>
  );

  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Series</TableHead>
            <TableHead>Published</TableHead>
            <TableHead className="text-right">Downloads</TableHead>
            <TableHead className="text-right">Views</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-48" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="h-4 w-12 ml-auto" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="h-4 w-12 ml-auto" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{sortableHeader("Title", "title")}</TableHead>
          <TableHead>{sortableHeader("Series", "series")}</TableHead>
          <TableHead>{sortableHeader("Published", "publish_date")}</TableHead>
          <TableHead className="text-right">
            {sortableHeader("Downloads", "downloads")}
          </TableHead>
          <TableHead className="text-right">
            {sortableHeader("Views", "views")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {episodes.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="text-center text-muted-foreground py-8"
            >
              No episodes found
            </TableCell>
          </TableRow>
        ) : (
          episodes.map((episode) => (
            <TableRow key={episode.id}>
              <TableCell className="font-medium max-w-[300px] truncate">
                {episode.title}
              </TableCell>
              <TableCell>
                {episode.series ? (
                  <Badge variant="secondary">{episode.series}</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">-</span>
                )}
              </TableCell>
              <TableCell>
                {episode.publish_date
                  ? formatDate(episode.publish_date)
                  : "-"}
              </TableCell>
              <TableCell
                className="text-right"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {episode.downloads != null
                  ? formatNumber(episode.downloads)
                  : "-"}
              </TableCell>
              <TableCell
                className="text-right"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {episode.views != null ? formatNumber(episode.views) : "-"}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
