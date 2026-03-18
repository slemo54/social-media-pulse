// @ts-nocheck
import { createAdminClient } from "@/lib/supabase/admin";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

async function findChannelId(handle: string): Promise<string> {
  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "channel",
    q: handle.startsWith("@") ? handle : `@${handle}`,
    key: YOUTUBE_API_KEY,
    maxResults: "1",
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${searchParams}`
  );

  if (!response.ok) {
    throw new Error(`YouTube search failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error(`Channel not found: ${handle}`);
  }

  return data.items[0].id.channelId;
}

async function addYouTubeChannel(handle: string) {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY not configured");
  }

  console.log(`Finding channel ID for ${handle}...`);
  const channelId = await findChannelId(handle);
  console.log(`✓ Found channel ID: ${channelId}`);

  const supabase = createAdminClient();

  // Get current YouTube data source config
  const { data: dataSource, error: fetchError } = await supabase
    .from("data_sources")
    .select("config")
    .eq("platform", "youtube")
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    throw new Error(`Failed to fetch data source: ${fetchError.message}`);
  }

  // Parse existing config or create new one
  let config = dataSource?.config || {};
  if (!config.channelIds) {
    config.channelIds = [];
  }

  // Add new channel ID if not already present
  if (!config.channelIds.includes(channelId)) {
    config.channelIds.push(channelId);
    console.log(`Adding channel ID to config: ${channelId}`);
  } else {
    console.log(`Channel ID already in config: ${channelId}`);
  }

  // Update data source
  const { error: updateError } = await supabase
    .from("data_sources")
    .update({
      config,
      updated_at: new Date().toISOString(),
    })
    .eq("platform", "youtube");

  if (updateError) {
    throw new Error(`Failed to update data source: ${updateError.message}`);
  }

  console.log("✓ Successfully added YouTube channel!");
  console.log(`✓ Config now contains ${config.channelIds.length} channel(s)`);
  console.log("✓ Channel IDs:", config.channelIds);
}

// Run the script
const handle = process.argv[2] || "@mammajumboshrimp";
addYouTubeChannel(handle)
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
