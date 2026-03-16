import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();

    // Get current period dates
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1).toISOString().split("T")[0];
    const today = now.toISOString().split("T")[0];

    const { data: goals, error } = await supabase
      .from("goals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    // Fetch aggregate totals for both periods
    const { data: monthlyData } = await supabase
      .from("daily_aggregates")
      .select("total_downloads,total_views,unique_listeners,sessions")
      .gte("date", monthStart)
      .lte("date", today);

    const { data: quarterlyData } = await supabase
      .from("daily_aggregates")
      .select("total_downloads,total_views,unique_listeners,sessions")
      .gte("date", quarterStart)
      .lte("date", today);

    const sumMetric = (rows: { total_downloads: number | null; total_views: number | null; unique_listeners: number | null; sessions: number | null }[] | null, metric: string): number => {
      if (!rows) return 0;
      return rows.reduce((acc, r) => {
        switch (metric) {
          case "monthly_downloads":
          case "quarterly_downloads": return acc + (r.total_downloads || 0);
          case "monthly_views":
          case "quarterly_views": return acc + (r.total_views || 0);
          case "monthly_listeners":
          case "quarterly_listeners": return acc + (r.unique_listeners || 0);
          case "monthly_sessions":
          case "quarterly_sessions": return acc + (r.sessions || 0);
          default: return acc + (r.total_downloads || 0);
        }
      }, 0);
    };

    const goalsWithProgress = (goals || []).map((goal) => {
      const data = goal.period === "quarterly" ? quarterlyData : monthlyData;
      const currentValue = sumMetric(data, goal.metric_name);
      const percentage = Math.min(100, goal.target_value > 0 ? (currentValue / goal.target_value) * 100 : 0);
      return { ...goal, currentValue, percentage: Math.round(percentage * 10) / 10 };
    });

    return NextResponse.json({ goals: goalsWithProgress });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();
    const { metric_name, target_value, period } = body;

    if (!metric_name || target_value == null || !period) {
      return NextResponse.json({ message: "metric_name, target_value, period required" }, { status: 400 });
    }
    if (!["monthly", "quarterly"].includes(period)) {
      return NextResponse.json({ message: "period must be monthly or quarterly" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("goals")
      .insert({ metric_name, target_value: Number(target_value), period })
      .select()
      .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ goal: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();
    const { id, metric_name, target_value, period } = body;

    if (!id) return NextResponse.json({ message: "id required" }, { status: 400 });

    const { data, error } = await supabase
      .from("goals")
      .update({ metric_name, target_value: Number(target_value), period })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ goal: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient();
    const { id } = await request.json();

    if (!id) return NextResponse.json({ message: "id required" }, { status: 400 });

    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
