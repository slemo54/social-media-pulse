import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();

    const { data: episode, error } = await supabase
      .from("episodes")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !episode) {
      return NextResponse.json(
        { message: "Episode not found" },
        { status: 404 }
      );
    }

    // Fetch episode metrics
    const { data: metrics } = await supabase
      .from("episode_metrics")
      .select("*")
      .eq("episode_id", params.id)
      .order("date", { ascending: false });

    return NextResponse.json({ episode, metrics: metrics || [] });
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const updates = (await request.json()) as {
      title?: string;
      series?: string | null;
      tags?: string[];
      description?: string | null;
    };

    const { data, error } = await supabase
      .from("episodes")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ episode: data });
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();

    const { error } = await supabase
      .from("episodes")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
