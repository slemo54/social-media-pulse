import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface YouTubeChannelInfo {
  id: string;
  title: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  thumbnailUrl?: string;
}

export async function GET() {
  try {
    const supabase = createClient();

    // Get YouTube data source config with channel IDs
    const { data: dataSource, error } = await supabase
      .from("data_sources")
      .select("config")
      .eq("platform", "youtube")
      .single() as { data: { config: Record<string, unknown> } | null; error: unknown };

    if (error || !dataSource) {
      return NextResponse.json({ channels: [] });
    }

    const channelIds: string[] = (dataSource.config?.channelIds as string[]) || [];
    const envChannelId = process.env.YOUTUBE_CHANNEL_ID;
    if (envChannelId && !channelIds.includes(envChannelId)) {
      channelIds.push(envChannelId);
    }

    if (channelIds.length === 0) {
      return NextResponse.json({ channels: [] });
    }

    // Fetch channel info from YouTube API
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      // Return channel IDs without names if no API key
      return NextResponse.json({
        channels: channelIds.map((id) => ({ id, title: id })),
      });
    }

    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: channelIds.join(","),
      key: apiKey,
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${params}`
    );

    if (!response.ok) {
      return NextResponse.json({
        channels: channelIds.map((id) => ({ id, title: id })),
      });
    }

    const data = await response.json();
    const channels: YouTubeChannelInfo[] = (data.items || []).map(
      (item: {
        id: string;
        snippet: { title: string; thumbnails?: { default?: { url?: string } } };
        statistics: {
          subscriberCount?: string;
          videoCount?: string;
          viewCount?: string;
        };
      }) => ({
        id: item.id,
        title: item.snippet.title,
        subscriberCount: parseInt(item.statistics.subscriberCount || "0", 10),
        videoCount: parseInt(item.statistics.videoCount || "0", 10),
        viewCount: parseInt(item.statistics.viewCount || "0", 10),
        thumbnailUrl: item.snippet.thumbnails?.default?.url,
      })
    );

    return NextResponse.json({ channels });
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
