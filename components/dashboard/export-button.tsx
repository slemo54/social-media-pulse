"use client";

import { useState } from "react";
import { Download, FileText, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/useToast";

interface ExportButtonProps {
  startDate: string;
  endDate: string;
}

interface ReportData {
  title: string;
  generatedAt: string;
  period: { startDate: string; endDate: string };
  kpis: { label: string; value: string }[];
  topEpisodes: {
    rank: number;
    title: string;
    series: string;
    pubDate: string;
    downloads: string;
    views: string;
    reach: string;
  }[];
  seriesPerformance: {
    series: string;
    episodes: number;
    avgDownloads: string;
    trend: string;
  }[];
}

async function generatePDF(data: ReportData): Promise<void> {
  // Dynamic import to avoid SSR issues
  const jsPDFModule = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const jsPDF = jsPDFModule.default;
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.title, pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated on ${new Date(data.generatedAt).toLocaleString()}`, pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 10;

  // KPI Scorecard
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("KPI Scorecard", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: data.kpis.map((k) => [k.label, k.value]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [23, 126, 141] },
    margin: { left: 14, right: 14 },
    theme: "striped",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // Top 5 Episodes
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Top 5 Episodes", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["#", "Title", "Series", "Published", "Downloads", "Views", "Total Reach"]],
    body: data.topEpisodes.map((ep) => [
      ep.rank,
      ep.title.length > 40 ? ep.title.substring(0, 40) + "…" : ep.title,
      ep.series,
      ep.pubDate,
      ep.downloads,
      ep.views,
      ep.reach,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [23, 126, 141] },
    margin: { left: 14, right: 14 },
    theme: "striped",
    columnStyles: { 1: { cellWidth: 55 } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // Series Performance
  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Performance by Series", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Series", "Episodes", "Avg Downloads", "Trend"]],
    body: data.seriesPerformance.map((s) => [s.series, s.episodes, s.avgDownloads, s.trend]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [23, 126, 141] },
    margin: { left: 14, right: 14 },
    theme: "striped",
  });

  doc.save(`report-${data.period.startDate}-${data.period.endDate}.pdf`);
}

export function ExportButton({ startDate, endDate }: ExportButtonProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const res = await fetch(`/api/export/report?startDate=${startDate}&endDate=${endDate}&format=pdf`);
      if (!res.ok) throw new Error("Failed to fetch report data");
      const data: ReportData = await res.json();
      await generatePDF(data);
      toast({ title: "PDF exported successfully" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = () => {
    const url = `/api/export/report?startDate=${startDate}&endDate=${endDate}&format=csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${startDate}-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          <Download className="mr-2 h-3.5 w-3.5" />
          {isExporting ? "Exporting..." : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportPDF}>
          <FileText className="mr-2 h-4 w-4" />
          Export PDF Report
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportCSV}>
          <Table2 className="mr-2 h-4 w-4" />
          Export CSV (Raw Data)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
