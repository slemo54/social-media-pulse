import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_PLATFORMS = ["megaphone", "apple_podcasts"] as const;
type SyncPlatform = (typeof VALID_PLATFORMS)[number];

function isValidPlatform(p: string): p is SyncPlatform {
  return (VALID_PLATFORMS as readonly string[]).includes(p);
}

// GET /api/sync-jobs — poll job status
export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const admin = createAdminClient();
  let query = admin
    .from("sync_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (platform && isValidPlatform(platform)) {
    query = query.eq("platform", platform);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { message: "Failed to fetch sync jobs", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

// POST /api/sync-jobs — create a pending sync job
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    platform?: string;
  };

  if (!body.platform || !isValidPlatform(body.platform)) {
    return NextResponse.json(
      {
        message: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Check for existing pending/running job for this platform
  const { data: existing } = await admin
    .from("sync_jobs")
    .select("id, status")
    .eq("platform", body.platform)
    .in("status", ["pending", "running", "waiting_for_login", "importing"])
    .limit(1);

  if (existing && existing.length > 0) {
    const job = existing[0] as { id: string; status: string };
    return NextResponse.json(
      {
        message: `A sync job for ${body.platform} is already ${job.status}`,
        existingJobId: job.id,
      },
      { status: 409 }
    );
  }

  const { data, error } = await admin
    .from("sync_jobs")
    .insert({
      platform: body.platform,
      status: "pending",
      log: [
        {
          ts: new Date().toISOString(),
          message: "Job created — waiting for runner",
        },
      ],
    } as never)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Failed to create sync job", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/sync-jobs — reset a stale job
export async function PATCH(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    jobId?: string;
    action?: string;
  };

  if (!body.jobId || body.action !== "reset") {
    return NextResponse.json(
      { message: "Provide jobId and action: 'reset'" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("sync_jobs")
    .update({
      status: "error",
      error_message: "Manually reset by user",
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", body.jobId)
    .in("status", ["pending", "running", "waiting_for_login", "importing"]);

  if (error) {
    return NextResponse.json(
      { message: "Failed to reset job", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
