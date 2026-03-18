// @ts-nocheck
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const handle = searchParams.get("handle");

    if (!handle) {
      return NextResponse.json(
        { error: "handle parameter is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "YOUTUBE_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Search for the channel by handle/username
    const searchParams2 = new URLSearchParams({
      part: "snippet",
      type: "channel",
      q: handle.startsWith("@") ? handle : `@${handle}`,
      key: apiKey,
      maxResults: "1",
    });

    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams2}`
    );

    if (!searchResponse.ok) {
      const error = await searchResponse.text();
      console.error("YouTube search error:", error);
      return NextResponse.json(
        { error: "Failed to search for channel" },
        { status: 500 }
      );
    }

    const searchData = await searchResponse.json();

    if (!searchData.items || searchData.items.length === 0) {
      return NextResponse.json(
        { error: "Channel not found" },
        { status: 404 }
      );
    }

    const channelId = searchData.items[0].id.channelId;
    const title = searchData.items[0].snippet.title;

    return NextResponse.json({
      success: true,
      channelId,
      title,
      handle: handle.startsWith("@") ? handle : `@${handle}`,
    });
  } catch (error) {
    console.error("Find channel error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
