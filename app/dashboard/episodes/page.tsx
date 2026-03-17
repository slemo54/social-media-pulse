"use client";

import { useState } from "react";
import { Search, Rss } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { EpisodeTable } from "@/components/dashboard/episode-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useEpisodes } from "@/hooks/useEpisodes";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";

export default function EpisodesPage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [series, setSeries] = useState("");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const {
    episodes,
    total,
    pageSize,
    isLoading,
    importRSS,
    isImporting,
  } = useEpisodes({ search, series: series || undefined, page });

  // Extract unique series for filter
  const uniqueSeries = Array.from(
    new Set(
      episodes
        .map((ep) => ep.series)
        .filter((s): s is string => s != null)
    )
  ).sort();

  const totalPages = Math.ceil(total / pageSize);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
  };

  const handleImport = () => {
    if (!feedUrl) return;
    importRSS(feedUrl, {
      onSuccess: () => {
        toast({ title: "Import complete", description: "Episodes imported successfully." });
        setImportOpen(false);
        setFeedUrl("");
      },
      onError: (err: Error) => {
        toast({
          title: "Import failed",
          description: err.message,
          variant: "destructive",
        });
      },
    });
  };

  // Sort episodes locally
  const sortedEpisodes = [...episodes].sort((a, b) => {
    if (!sortBy) return 0;
    const aVal = a[sortBy as keyof typeof a];
    const bVal = b[sortBy as keyof typeof b];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  return (
    <div className="flex flex-col">
      <Header
        title="Episodi"
        description="Gestisci e sfoglia gli episodi del podcast"
        userEmail={user?.email || undefined}
        onLogout={signOut}
      />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca episodi..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-9"
            />
          </div>
          <Select
            value={series}
            onValueChange={(v) => {
              setSeries(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Tutte le Serie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le Serie</SelectItem>
              {uniqueSeries.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Rss className="mr-2 h-3.5 w-3.5" />
            Importa da RSS
          </Button>
        </div>

        {/* Episodes Table */}
        <EpisodeTable
          episodes={sortedEpisodes}
          loading={isLoading}
          onSort={handleSort}
          sortBy={sortBy}
          sortDir={sortDir}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                Precedente
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
              >
                Successivo
              </Button>
            </div>
          </div>
        )}

        {/* Import Dialog */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importa da Feed RSS</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="feedUrl">URL Feed RSS</Label>
                <Input
                  id="feedUrl"
                  placeholder="https://feeds.example.com/podcast.xml"
                  value={feedUrl}
                  onChange={(e) => setFeedUrl(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setImportOpen(false)}
              >
                Annulla
              </Button>
              <Button
                onClick={handleImport}
                disabled={!feedUrl || isImporting}
              >
                {isImporting ? "Importazione in corso..." : "Importa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
