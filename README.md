# Quickest train home to Cambridge

Mobile-first Next.js app that answers: from London right now, what is the fastest train route back to Cambridge?

It uses browser geolocation or a manual Tube-station picker, asks TfL for the London access leg to King's Cross, St Pancras and Liverpool Street, asks Realtime Trains for Cambridge-bound departures, then ranks by earliest arrival at Cambridge (CBG).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/KaimanC/quickest-train-home-cambridge&project-name=quickest-train-home-cambridge&repository-name=quickest-train-home-cambridge&env=RTT_AUTH_MODE,RTT_ACCESS_TOKEN,TFL_APP_KEY,NEXT_PUBLIC_REFRESH_INTERVAL_MS&envDescription=Realtime%20Trains%20and%20TfL%20API%20settings&envLink=https://github.com/KaimanC/quickest-train-home-cambridge/blob/main/.env.example)

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Without Realtime Trains credentials the app still runs, but train departures are mocked and clearly labelled. TfL often responds without a key for light development, but set `TFL_APP_KEY` for deployed use.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `RTT_AUTH_MODE` | Yes | Use `token` for the new API portal. Use `basic` only for old api.rtt.io accounts. |
| `RTT_ACCESS_TOKEN` | For live RTT | Bearer token from the new Realtime Trains portal. |
| `RTT_API_BASE_URL` | No | Defaults to `https://data.rtt.io`. |
| `RTT_BASIC_USERNAME` / `RTT_BASIC_PASSWORD` | Legacy only | Old Realtime Trains Basic Auth credentials. |
| `RTT_LEGACY_BASE_URL` | Legacy only | Defaults to `https://api.rtt.io/api/v1`. |
| `TFL_APP_KEY` | Recommended | TfL Unified API key. TfL says `app_id` is no longer required. |
| `USE_MOCK_DATA` | No | Set `true` to force mock train data. |
| `NEXT_PUBLIC_REFRESH_INTERVAL_MS` | No | Defaults to `60000`. |

## API account setup

### Realtime Trains

1. Go to `https://api-portal.rtt.io`.
2. Sign in with an RTT unified login.
3. Request an API token for personal/non-commercial use.
4. Add the token to Vercel as `RTT_ACCESS_TOKEN`.

The older Pull API at `api.rtt.io` used HTTP Basic Auth and is still supported by this app with `RTT_AUTH_MODE=basic`, but the new portal uses bearer tokens.

### TfL

1. Go to `https://api-portal.tfl.gov.uk`.
2. Register and activate your account.
3. In Products, subscribe to the 500 requests data plan.
4. In Profile, copy an API key and set it as `TFL_APP_KEY`.

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import it in Vercel or use the deploy button above.
3. Set the env vars from `.env.example`.
4. Deploy.

The app uses Next.js App Router route handlers under `src/app/api/*`, so all Realtime Trains and TfL requests run server-side. Live route responses use short private caching (`max-age=15`, `stale-while-revalidate=45`) and the client refreshes every 60 seconds by default.

## Route ranking

See [docs/route-ranking.md](docs/route-ranking.md).

