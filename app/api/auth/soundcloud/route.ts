import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!clientId) {
    return NextResponse.json(
      { message: "SoundCloud client ID not configured" },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/auth/soundcloud/callback`;
  const authUrl = new URL("https://soundcloud.com/connect");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "non-expiring");

  return NextResponse.redirect(authUrl.toString());
}
