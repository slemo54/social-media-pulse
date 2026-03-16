"use client";

import { useState } from "react";
import { ReferenceLine } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useToast } from "@/hooks/useToast";
import type { Annotation } from "@/types/database";

interface AnnotationMarkersProps {
  startDate: string;
  endDate: string;
  /** X-axis key used in the chart data */
  xKey?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  event: "#6366f1",
  campaign: "#f59e0b",
  guest: "#10b981",
  other: "#94a3b8",
};

const CATEGORY_LABELS: Record<string, string> = {
  event: "Event",
  campaign: "Campaign",
  guest: "Guest",
  other: "Other",
};

/**
 * Returns an array of Recharts ReferenceLine components to overlay on a chart.
 * These mark annotation dates with a colored vertical line and label.
 */
export function AnnotationMarkers({ startDate, endDate, xKey = "date" }: AnnotationMarkersProps) {
  const { annotations } = useAnnotations({ startDate, endDate });

  return (
    <>
      {annotations.map((ann) => (
        <ReferenceLine
          key={ann.id}
          x={ann.date}
          stroke={CATEGORY_COLORS[ann.category] || "#94a3b8"}
          strokeDasharray="4 2"
          strokeWidth={1.5}
          label={{
            value: ann.note.length > 20 ? ann.note.substring(0, 20) + "…" : ann.note,
            position: "insideTopLeft",
            fontSize: 10,
            fill: CATEGORY_COLORS[ann.category] || "#94a3b8",
          }}
          ifOverflow="visible"
        />
      ))}
    </>
  );
}

interface AddAnnotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillDate?: string;
}

/**
 * Dialog to add a new annotation. Opened when user clicks on a chart point.
 */
export function AddAnnotationDialog({
  open,
  onOpenChange,
  prefillDate,
}: AddAnnotationDialogProps) {
  const { createAnnotation, isCreating } = useAnnotations();
  const { toast } = useToast();
  const [date, setDate] = useState(prefillDate || new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("event");

  const handleSave = () => {
    if (!date || !note) return;
    createAnnotation(
      { date, note, category },
      {
        onSuccess: () => {
          toast({ title: "Annotation added" });
          setNote("");
          onOpenChange(false);
        },
        onError: (err: Error) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Annotation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ann-date">Date</Label>
            <Input
              id="ann-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-note">Note</Label>
            <Input
              id="ann-note"
              placeholder="E.g. Special guest episode, Launch campaign..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full inline-block"
                        style={{ backgroundColor: CATEGORY_COLORS[val] }}
                      />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!date || !note || isCreating}>
            {isCreating ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AnnotationsListProps {
  startDate: string;
  endDate: string;
}

/**
 * Manage annotations list with delete capability.
 */
export function AnnotationsList({ startDate, endDate }: AnnotationsListProps) {
  const { annotations, deleteAnnotation } = useAnnotations({ startDate, endDate });
  const { toast } = useToast();

  const handleDelete = (ann: Annotation) => {
    deleteAnnotation(ann.id);
    toast({ title: "Annotation removed" });
  };

  if (annotations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No annotations for this period
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {annotations.map((ann) => (
        <div
          key={ann.id}
          className="flex items-start justify-between gap-3 p-3 rounded-md border bg-card text-sm"
        >
          <div className="flex items-start gap-2.5">
            <span
              className="mt-0.5 h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: CATEGORY_COLORS[ann.category] || "#94a3b8" }}
            />
            <div>
              <p className="font-medium">{ann.note}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ann.date} · {CATEGORY_LABELS[ann.category] || ann.category}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => handleDelete(ann)}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
