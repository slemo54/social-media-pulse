// @ts-nocheck
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const sp = request.nextUrl.searchParams;
    const startDate = sp.get("startDate");
    const endDate = sp.get("endDate");

    let query = supabase
      .from("annotations")
      .select("*")
      .order("date", { ascending: true });

    if (startDate) query = query.gte("date", startDate);
    if (endDate) query = query.lte("date", endDate);

    const { data, error } = await query;
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    return NextResponse.json({ annotations: data || [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const body = await request.json();
    const { date, note, category } = body;

    if (!date || !note || !category) {
      return NextResponse.json({ message: "date, note, category required" }, { status: 400 });
    }
    if (!["event", "campaign", "guest", "other"].includes(category)) {
      return NextResponse.json({ message: "Invalid category" }, { status: 400 });
    }

    const { data, error } = await (supabase
      .from("annotations")
      .insert({
        date,
        note,
        category,
        user_id: user?.id || null,
      } as any)
      .select()
      .single());

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ annotation: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient() as any;
    const body = await request.json();
    const { id, date, note, category } = body;

    if (!id) return NextResponse.json({ message: "id required" }, { status: 400 });

    const { data, error } = await supabase
      .from("annotations")
      .update({ date, note, category })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ annotation: data });
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

    const { error } = await supabase.from("annotations").delete().eq("id", id);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
