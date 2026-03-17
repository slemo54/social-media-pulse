"use client";

import { useState } from "react";
import { Plus, Target, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Header } from "@/components/dashboard/header";
import { useGoals, type GoalWithProgress } from "@/hooks/useGoals";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { formatNumber, cn } from "@/lib/utils";

const METRIC_OPTIONS = [
  { value: "monthly_downloads", label: "Download Mensili" },
  { value: "monthly_views", label: "Visualizzazioni Mensili" },
  { value: "monthly_listeners", label: "Ascoltatori Mensili" },
  { value: "monthly_sessions", label: "Sessioni Mensili" },
  { value: "quarterly_downloads", label: "Download Trimestrali" },
  { value: "quarterly_views", label: "Visualizzazioni Trimestrali" },
  { value: "quarterly_listeners", label: "Ascoltatori Trimestrali" },
  { value: "quarterly_sessions", label: "Sessioni Trimestrali" },
];

interface GoalFormState {
  metric_name: string;
  target_value: string;
  period: string;
}

const EMPTY_FORM: GoalFormState = { metric_name: "monthly_downloads", target_value: "", period: "monthly" };

function CircularProgress({ percentage, color = "#20808D" }: { percentage: number; color?: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, percentage) / 100) * circumference;

  return (
    <svg width={88} height={88} viewBox="0 0 88 88">
      <circle
        cx={44}
        cy={44}
        r={radius}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth={7}
      />
      <circle
        cx={44}
        cy={44}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x={44}
        y={44}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={13}
        fontWeight={700}
        fill="currentColor"
      >
        {percentage.toFixed(0)}%
      </text>
    </svg>
  );
}

function metricLabel(metricName: string): string {
  return METRIC_OPTIONS.find((o) => o.value === metricName)?.label || metricName;
}

function progressColor(pct: number): string {
  if (pct >= 100) return "#10b981";
  if (pct >= 70) return "#20808D";
  if (pct >= 40) return "#f59e0b";
  return "#ef4444";
}

export default function GoalsPage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { goals, isLoading, createGoal, updateGoal, deleteGoal, isCreating, isUpdating } = useGoals();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalWithProgress | null>(null);
  const [form, setForm] = useState<GoalFormState>(EMPTY_FORM);

  const openCreate = () => {
    setEditingGoal(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (goal: GoalWithProgress) => {
    setEditingGoal(goal);
    setForm({
      metric_name: goal.metric_name,
      target_value: String(goal.target_value),
      period: goal.period,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const targetNum = parseFloat(form.target_value);
    if (!form.metric_name || isNaN(targetNum) || targetNum <= 0) {
      toast({ title: "Invalid input", description: "Please fill all fields correctly.", variant: "destructive" });
      return;
    }

    if (editingGoal) {
      updateGoal(
        { id: editingGoal.id, metric_name: form.metric_name, target_value: targetNum, period: form.period },
        {
          onSuccess: () => {
            toast({ title: "Goal updated" });
            setDialogOpen(false);
          },
          onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
        }
      );
    } else {
      createGoal(
        { metric_name: form.metric_name, target_value: targetNum, period: form.period },
        {
          onSuccess: () => {
            toast({ title: "Goal created" });
            setDialogOpen(false);
          },
          onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = (goal: GoalWithProgress) => {
    if (!confirm(`Delete goal "${metricLabel(goal.metric_name)}"?`)) return;
    deleteGoal(goal.id);
    toast({ title: "Goal deleted" });
  };

  return (
    <div className="flex flex-col">
      <Header
        title="Obiettivi"
        description="Monitora i tuoi obiettivi di performance"
        userEmail={user?.email || undefined}
        onLogout={signOut}
      />

      <div className="p-6 space-y-6">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {goals.length} obiettivo{goals.length !== 1 ? "i" : ""} attivo{goals.length !== 1 ? "/" : ""}
          </p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Nuovo Obiettivo
          </Button>
        </div>

        {/* Goals grid */}
        {isLoading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : goals.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Target className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium mb-1">Nessun obiettivo ancora</p>
              <p className="text-sm text-muted-foreground mb-4">
                Imposta obiettivi di performance per monitorare la crescita del tuo podcast
              </p>
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Crea il tuo primo obiettivo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {goals.map((goal) => {
              const color = progressColor(goal.percentage);
              return (
                <Card key={goal.id} className="relative">
                  <CardHeader className="flex flex-row items-start justify-between pb-3">
                    <div>
                      <CardTitle className="text-sm font-medium">{metricLabel(goal.metric_name)}</CardTitle>
                      <Badge variant="outline" className="text-xs mt-1 capitalize">
                        {goal.period}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(goal)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:text-destructive"
                        onClick={() => handleDelete(goal)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center gap-4">
                    <CircularProgress percentage={goal.percentage} color={color} />
                    <div>
                      <p className="text-2xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatNumber(goal.currentValue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        di {formatNumber(goal.target_value)} target
                      </p>
                      <p
                        className={cn(
                          "text-xs font-medium mt-1",
                          goal.percentage >= 100 ? "text-emerald-500" : goal.percentage >= 70 ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        {goal.percentage >= 100
                          ? "Obiettivo raggiunto!"
                          : `${formatNumber(goal.target_value - goal.currentValue)} rimanenti`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGoal ? "Modifica Obiettivo" : "Nuovo Obiettivo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Metrica</Label>
              <Select
                value={form.metric_name}
                onValueChange={(v) => {
                  const period = v.startsWith("quarterly") ? "quarterly" : "monthly";
                  setForm({ ...form, metric_name: v, period });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target">Valore Target</Label>
              <Input
                id="target"
                type="number"
                min={1}
                placeholder="es. 10000"
                value={form.target_value}
                onChange={(e) => setForm({ ...form, target_value: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Periodo</Label>
              <Select value={form.period} onValueChange={(v) => setForm({ ...form, period: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensile</SelectItem>
                  <SelectItem value="quarterly">Trimestrale</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} disabled={isCreating || isUpdating}>
              {isCreating || isUpdating ? "Salvataggio..." : editingGoal ? "Aggiorna" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
