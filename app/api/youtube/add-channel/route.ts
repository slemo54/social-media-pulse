import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { handle } = (await request.json()) as { handle?: string };

    if (!handle) {
      return NextResponse.json({ message: "handle is required" }, { status: 400 });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { message: "YOUTUBE_API_KEY not configured on server" },
        { status: 500 }
      );
    }

    // Search for the channel by handle
    const searchHandle = handle.startsWith("@") ? handle : `@${handle}`;
    const params = new URLSearchParams({
      part: "snippet",
      type: "channel",
      q: searchHandle,
      key: apiKey,
      maxResults: "1",
    });

    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`
    );

    if (!ytRes.ok) {
      const errText = await ytRes.text();
      return NextResponse.json(
        { message: `YouTube API error: ${ytRes.status} ${errText}` },
        { status: 502 }
      );
    }

    const ytData = await ytRes.json();

    if (!ytData.items || ytData.items.length === 0) {
      return NextResponse.json(
        { message: `Channel not found: ${searchHandle}` },
        { status: 404 }
      );
    }

    const channelId: string = ytData.items[0].id.channelId;
    const channelTitle: string = ytData.items[0].snippet.title;

    // Update data_sources config in Supabase
    const supabase = createAdminClient();

    const { data: dataSource, error: fetchError } = await supabase
      .from("data_sources")
      .select("config")
      .eq("platform", "youtube")
      .single() as { data: { config: Record<string, unknown> } | null; error: unknown };

    if (fetchError && (fetchError as { code?: string }).code !== "PGRST116") {
      return NextResponse.json(
        { message: `DB fetch error: ${(fetchError as Error).message}` },
        { status: 500 }
      );
    }

    const config: Record<string, unknown> = (dataSource?.config as Record<string, unknown>) || {};
    const channelIds: string[] = (config.channelIds as string[]) || [];

    const alreadyExists = channelIds.includes(channelId);
    if (!alreadyExists) {
      channelIds.push(channelId);
    }
    config.channelIds = channelIds;

    const { error: updateError } = await supabase
      .from("data_sources")
      .update({ config, updated_at: new Date().toISOString() } as never)
      .eq("platform", "youtube");

    if (updateError) {
      return NextResponse.json(
        { message: `DB update error: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      channelId,
      channelTitle,
      alreadyExists,
      totalChannels: channelIds.length,
    });
  } catch {
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
