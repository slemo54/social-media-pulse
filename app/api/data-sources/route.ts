import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("data_sources")
      .select("*")
      .order("platform", { ascending: true });

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = createClient();
    const { platform, is_active, display_name } = (await request.json()) as {
      platform?: string;
      is_active?: boolean;
      display_name?: string;
    };

    if (!platform) {
      return NextResponse.json(
        { message: "platform is required" },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (is_active !== undefined) updatePayload.is_active = is_active;
    if (display_name !== undefined) updatePayload.display_name = display_name;

    const { data, error } = await supabase
      .from("data_sources")
      .update(updatePayload as never)
      .eq("platform", platform)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
