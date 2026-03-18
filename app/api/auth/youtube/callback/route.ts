import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface YouTubeChannelItem {
  id: string;
  snippet: { title: string };
}

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
    const clientId = process.env.YOUTUBE_CLIENT_ID!;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/auth/youtube/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
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

    const tokenData: GoogleTokenResponse = await tokenResponse.json();

    if (!tokenData.refresh_token) {
      return new NextResponse(
        `<html><body><h1>No Refresh Token</h1><p>Google did not return a refresh token. Try revoking access at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> and try again.</p><script>setTimeout(()=>window.close(),5000)</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Discover channels owned by this account
    const channelsResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );

    if (!channelsResponse.ok) {
      const err = await channelsResponse.text();
      return new NextResponse(
        `<html><body><h1>Failed to fetch channels</h1><p>${err}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const channelsData = await channelsResponse.json();
    const discoveredChannels: YouTubeChannelItem[] = channelsData.items || [];

    if (discoveredChannels.length === 0) {
      return new NextResponse(
        `<html><body><h1>No YouTube channels found</h1><p>This Google account does not own any YouTube channels.</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Read current data_sources config for YouTube
    const supabaseAdmin = createAdminClient();
    const { data: dataSource } = await supabaseAdmin
      .from("data_sources")
      .select("config")
      .eq("platform", "youtube")
      .single() as { data: { config: Record<string, unknown> } | null; error: unknown };

    const currentConfig = (dataSource?.config as Record<string, unknown>) || {};
    const channelIds: string[] = (currentConfig.channelIds as string[]) || [];
    const channelCredentials: Record<
      string,
      { refresh_token: string; account_email?: string; connected_at: string }
    > = (currentConfig.channelCredentials as Record<string, { refresh_token: string; account_email?: string; connected_at: string }>) || {};

    // For each discovered channel, add to channelIds and store credentials
    const connectedNames: string[] = [];
    for (const ch of discoveredChannels) {
      if (!channelIds.includes(ch.id)) {
        channelIds.push(ch.id);
      }
      channelCredentials[ch.id] = {
        refresh_token: tokenData.refresh_token,
        connected_at: new Date().toISOString(),
      };
      connectedNames.push(ch.snippet.title);
    }

    // Update data_sources
    await supabaseAdmin
      .from("data_sources")
      .update({
        config: {
          ...currentConfig,
          channelIds,
          channelCredentials,
        },
        api_key_configured: true,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("platform", "youtube");

    const namesStr = connectedNames.join(", ");
    return new NextResponse(
      `<html><body><h1>YouTube Connected!</h1><p>Connected: ${namesStr}</p><script>setTimeout(()=>{window.opener?.postMessage('youtube-oauth-connected','*');window.close()},2000)</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch {
    return new NextResponse(
      `<html><body><h1>Error</h1><p>Failed to complete authorization</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
