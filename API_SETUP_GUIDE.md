# API Setup Guide — Social Media Pulse

## Status Quo
- ✅ Google Analytics 4 — Synced (working)
- ❌ Megaphone — 404 on old endpoint (now fixed with fallback)
- ❌ YouTube — 400 Bad Request (OAuth creds missing or invalid)
- ❌ SoundCloud — OAuth not completed
- ❌ RSS Feed — URL not configured

---

## Environment Variables Checklist

### 1. MEGAPHONE ✅
**Status**: Configured in .env.local
```
MEGAPHONE_API_KEY=cf6410d21f7059191df5c2ed277dfd5b
MEGAPHONE_NETWORK_ID=a4855c06-8224-11ee-846c-43b73d6c288c
MEGAPHONE_PODCAST_ID=574248e4-87b2-11ee-ac3b-b71ab9b899c4
```

**Fix Applied**:
- Changed endpoint from `/download_stats` to `/analytics/downloads`
- Added fallback to old endpoint if new one returns 404
- Added detailed error logging showing full API response body

**Test**: Run sync for Megaphone on Settings page

---

### 2. YOUTUBE ⚠️
**Missing OAuth Credentials** (required for YouTube Analytics API)
```
YOUTUBE_CLIENT_ID=xxxx.apps.googleusercontent.com          ❌ NOT SET
YOUTUBE_CLIENT_SECRET=GOCSPX-...                           ❌ NOT SET
YOUTUBE_OAUTH_REFRESH_TOKEN=1//0...                        ❌ NOT SET
```

**What's Set**:
```
YOUTUBE_API_KEY=AIzaSyBP821nLWm_YfyJzayJnMx6CNidG0cMZUI    ✅
YOUTUBE_CHANNEL_ID=UCBNsKGjw2EFFYAy52hUFx9A                ✅
```

**How to Fix**:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project → APIs & Services → Library
3. Search for and **Enable**: "YouTube Analytics API" (in addition to YouTube Data API v3)
4. Go to Credentials → Create OAuth 2.0 Client (Desktop app)
5. Download the credentials JSON
6. Use [OAuth Playground](https://developers.google.com/oauthplayground) to get refresh token:
   - Click settings → check "Use your own OAuth credentials"
   - Enter Client ID and Secret
   - Authorize with the scopes: `https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly`
   - Get the refresh token from the response
7. Set in Vercel:
   - `YOUTUBE_CLIENT_ID`
   - `YOUTUBE_CLIENT_SECRET`
   - `YOUTUBE_OAUTH_REFRESH_TOKEN`

**Fix Applied**: Added detailed error logging (status, statusText, full response body) so next sync will show exact error

---

### 3. SOUNDCLOUD 🔐
**OAuth Flow Required** (no static token)
```
SOUNDCLOUD_CLIENT_ID=HObTJSu3xB077P2hRMiWSyKuXkkqNO4t          ✅ Set
SOUNDCLOUD_CLIENT_SECRET=RnM4gigMEUkGtN0GBv88W26O8EFsGI9R      ✅ Set
SOUNDCLOUD_ACCESS_TOKEN=xxxxxxxx                             ❌ Obtain via OAuth
```

**How to Fix**:
1. Open: `https://social-media-pulse.vercel.app/dashboard/settings` (or your deployment URL)
2. Find SoundCloud → click "Connect SoundCloud"
3. Authorize with your SoundCloud account
4. Token automatically saved to database
5. Run sync → should work

**Note**: No static token needed if OAuth is completed. The connector will fetch the token from `data_sources.config` during sync.

---

### 4. RSS Feed ❌
**Missing Configuration**
```
RSS_FEED_URL=https://feeds.megaphone.fm/xxxxx              ❌ NOT SET
```

**How to Get**:
1. Go to Megaphone CMS: https://cms.megaphone.fm
2. Navigate to your Podcast → Settings → Distribution
3. Copy the RSS Feed URL (looks like `https://feeds.megaphone.fm/XXXXXX`)

**Set on Vercel**:
- Add `RSS_FEED_URL` to environment variables

**Effect**: Episodes auto-import from RSS during each sync

---

### 5. OTHER VARS (for production)
```
CRON_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx               ❌ Generate with: openssl rand -hex 32
NEXTAUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx           ❌ Generate with: openssl rand -hex 32
NEXT_PUBLIC_APP_URL=https://social-media-pulse.vercel.app  ⚠️  Update to your Vercel domain
```

---

## Quick Setup Checklist for Vercel

### In Vercel Dashboard → Project Settings → Environment Variables:

```
✅ NEXT_PUBLIC_SUPABASE_URL
✅ NEXT_PUBLIC_SUPABASE_ANON_KEY
✅ SUPABASE_SERVICE_ROLE_KEY
✅ MEGAPHONE_API_KEY
✅ MEGAPHONE_NETWORK_ID
✅ MEGAPHONE_PODCAST_ID
✅ YOUTUBE_API_KEY
✅ YOUTUBE_CHANNEL_ID
❌ YOUTUBE_CLIENT_ID                  ← ADD
❌ YOUTUBE_CLIENT_SECRET               ← ADD
❌ YOUTUBE_OAUTH_REFRESH_TOKEN         ← ADD
✅ SOUNDCLOUD_CLIENT_ID
✅ SOUNDCLOUD_CLIENT_SECRET
❌ RSS_FEED_URL                        ← ADD
❌ CRON_SECRET                         ← ADD (openssl rand -hex 32)
❌ NEXTAUTH_SECRET                     ← ADD (openssl rand -hex 32)
⚠️  NEXT_PUBLIC_APP_URL                ← UPDATE to your Vercel domain
```

---

## Code Improvements Made

### Megaphone (`lib/connectors/megaphone.ts`)
- ✅ Changed primary endpoint to `/analytics/downloads`
- ✅ Added fallback to `/download_stats` if 404
- ✅ Shows full error response body in logs

### YouTube (`lib/connectors/youtube.ts`)
- ✅ Added detailed console logging for all API errors
- ✅ Shows full response body (status, statusText, error details)
- ✅ Logs full URL for debugging

### SoundCloud (`lib/connectors/soundcloud.ts`)
- ✅ Already configured to read token from `data_sources.config` (saved after OAuth)
- ✅ Clear error messages guide user to OAuth flow

---

## Testing Workflow

1. **Local Testing**:
   ```bash
   npm run dev
   # Go to http://localhost:3000/dashboard/settings
   # Click "Full Sync" for each platform
   # Check sync logs for errors
   ```

2. **After Vercel Updates**:
   - Push changes to GitHub
   - Vercel auto-deploys
   - Go to `https://social-media-pulse.vercel.app/dashboard/settings`
   - Run sync tests
   - Check "Sync Log" tab for detailed errors

3. **Expected Results After Fix**:
   - Megaphone: ✅ Records > 0, Status = "success"
   - YouTube: ✅ Records > 0 (after OAuth setup)
   - SoundCloud: ✅ Green status, Records > 0 (after OAuth)
   - Episodes: ✅ Auto-imported from RSS Feed

---

## Debugging Tips

If sync still fails:
1. Go to `/dashboard/settings` → "Sync Log"
2. Click on failed sync entry
3. Read error message carefully
4. Check Vercel logs: Project → Deployments → Functions → `/api/sync`
5. Look for detailed error output (now includes full API response)

---

## Next Steps

1. Generate secrets: `openssl rand -hex 32` (do 2x for CRON_SECRET and NEXTAUTH_SECRET)
2. Get RSS URL from Megaphone dashboard
3. Set up YouTube OAuth (follow guide above)
4. Update Vercel environment variables
5. Complete SoundCloud OAuth (via Settings page)
6. Deploy and test full sync
