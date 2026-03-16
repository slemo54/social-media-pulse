import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return new NextResponse(
      `<html><body><h1>Authorization Failed</h1><p>${error || "No code received"}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const clientId = process.env.SOUNDCLOUD_CLIENT_ID!;
    const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET!;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/auth/soundcloud/callback`;

    const tokenResponse = await fetch("https://api.soundcloud.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      return new NextResponse(
        `<html><body><h1>Token Exchange Failed</h1><p>${err}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    // Store the access token in data_sources.config
    const supabaseAdmin = createAdminClient();
    await supabaseAdmin
      .from("data_sources")
      .update({
        api_key_configured: true,
        config: {
          access_token: tokenData.access_token,
          ...(tokenData.refresh_token
            ? { refresh_token: tokenData.refresh_token }
            : {}),
        },
        updated_at: new Date().toISOString(),
      } as never)
      .eq("platform", "soundcloud");

    return new NextResponse(
      `<html><body><h1>SoundCloud Connected!</h1><p>You can close this window.</p><script>setTimeout(()=>{window.opener?.postMessage('soundcloud-connected','*');window.close()},2000)</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch {
    return new NextResponse(
      `<html><body><h1>Error</h1><p>Failed to complete authorization</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
