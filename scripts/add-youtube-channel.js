#!/usr/bin/env node
// Simple JS script to add YouTube channel without TS compilation

const https = require("https");

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { ...options }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    });
    req.on("error", reject);
  });
}

async function findChannelId(handle) {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY not configured");
  }

  const searchHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", searchHandle);
  url.searchParams.set("key", YOUTUBE_API_KEY);
  url.searchParams.set("maxResults", "1");

  console.log(`🔍 Searching for channel: ${searchHandle}`);

  const data = await fetchJson(url.toString());

  if (!data.items || data.items.length === 0) {
    throw new Error(`Channel not found: ${searchHandle}`);
  }

  const channelId = data.items[0].id.channelId;
  const title = data.items[0].snippet.title;

  console.log(`✅ Found: ${title} (${channelId})`);
  return channelId;
}

async function updateDatabase(channelId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase credentials not configured");
  }

  const url = new URL(
    `${SUPABASE_URL}/rest/v1/data_sources?platform=eq.youtube`
  );

  console.log("📝 Updating database...");

  // Get current config
  const getRes = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!getRes.ok) {
    throw new Error(
      `Failed to fetch data source: ${getRes.status} ${getRes.statusText}`
    );
  }

  const [dataSource] = await getRes.json();
  let config = dataSource?.config || {};

  if (!config.channelIds) {
    config.channelIds = [];
  }

  if (!config.channelIds.includes(channelId)) {
    config.channelIds.push(channelId);
    console.log(`➕ Added channel ID: ${channelId}`);
  } else {
    console.log(`✓ Channel ID already in config: ${channelId}`);
  }

  // Update config
  const updateRes = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ config }),
  });

  if (!updateRes.ok) {
    throw new Error(
      `Failed to update config: ${updateRes.status} ${updateRes.statusText}`
    );
  }

  console.log(`✅ Database updated!`);
  console.log(`📊 Channel IDs: ${config.channelIds.join(", ")}`);
}

// Main
const handle = process.argv[2] || "@mammajumboshrimp";

(async () => {
  try {
    const channelId = await findChannelId(handle);
    await updateDatabase(channelId);
    console.log("\n✨ Done! Run 'npm run sync' or use dashboard to sync data");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
})();
