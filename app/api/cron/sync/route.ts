import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    if (token !== process.env.CRON_SECRET) {
      return NextResponse.json({ message: "Invalid token" }, { status: 401 });
    }

    // Call the sync endpoint internally
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const syncResponse = await fetch(`${appUrl}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({ fullSync: false }),
    });

    const results = await syncResponse.json();
    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
