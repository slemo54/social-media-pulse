# Add YouTube Channel to Dashboard

## Aggiungere il canale @mammajumboshrimp

### Opzione 1: Con Script (Consigliato)

```bash
npx tsx scripts/add-youtube-channel.ts "@mammajumboshrimp"
```

Lo script farà automaticamente:
1. ✅ Cercare il channel ID usando YouTube Data API
2. ✅ Leggere la configurazione attuale dal database
3. ✅ Aggiungere il nuovo channel ID al config
4. ✅ Aggiornare data_sources table

### Opzione 2: Manuale via API

```bash
# 1. Trovare il channel ID
curl "http://localhost:3000/api/youtube/find-channel?handle=@mammajumboshrimp"

# Risposta:
# {
#   "success": true,
#   "channelId": "UC...",
#   "title": "Mamma Jumbo Shrimp",
#   "handle": "@mammajumboshrimp"
# }

# 2. Aggiungere manualmente al database (via Supabase console)
# - Vai a data_sources table
# - Trova il record con platform = "youtube"
# - Aggiorna il campo config JSON:
# {
#   "channelIds": ["UC...", "UC...other_channel..."]
# }
```

## Dopo Aver Aggiunto il Canale

1. **Verifica il config:**
   ```bash
   # Vai su Supabase > data_sources
   # Verifica che il config JSON contenga il nuovo channel ID
   ```

2. **Esegui un sync:**
   - Dashboard → Piattaforme → YouTube → "Sync Now"
   - O via API: `POST /api/sync` con body: `{ "platform": "youtube" }`

3. **Verifica i dati:**
   - I dati da tutti i canali YouTube vengono aggregati
   - Views, watch time, likes, comments vengono sommati
   - Gli episodi individuali sono tracciati per channel

## Configurazione

Il connector YouTube ora supporta:
- ✅ Multiple channel IDs dal database config
- ✅ Fallback a YOUTUBE_CHANNEL_ID env var
- ✅ Aggregazione automatica per canale
- ✅ Tracciamento episodio per canale

## Notes

- **YOUTUBE_API_KEY**: Richiesta per cercare canali
- **YOUTUBE_OAUTH_REFRESH_TOKEN**: Richiesta per analytics
- I dati vengono aggregati per data (somma across channels)
- Gli episodi mantengono il channel ID per tracking

## Troubleshooting

Se lo script fallisce:

```bash
# 1. Verifica le env vars
echo $YOUTUBE_API_KEY

# 2. Testa la ricerca manualmente
curl "http://localhost:3000/api/youtube/find-channel?handle=@mammajumboshrimp"

# 3. Verifica database connection
# Usa Supabase console per vedere data_sources
```
