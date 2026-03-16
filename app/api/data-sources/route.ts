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
    const { platform, api_key_configured } = (await request.json()) as {
      platform?: string;
      api_key_configured?: boolean;
    };

    if (!platform) {
      return NextResponse.json(
        { message: "platform is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("data_sources")
      .update({
        api_key_configured: api_key_configured ?? false,
        updated_at: new Date().toISOString(),
      } as never)
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
