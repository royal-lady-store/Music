# Open Media Hub

Free, ad-free, no-login search, streaming and download of Creative Commons / public-domain audio and video.
Pure static site: HTML + Tailwind (CDN) + vanilla JS modules. No build step, no backend.

## Structure
```
open-media-hub/
├── index.html        UI, filters, sticky player
├── js/
│   ├── config.js     keys, page size, timeouts, enable/disable sources
│   ├── providers.js  Internet Archive, Wikimedia Commons, Jamendo adapters + fallback logic
│   └── app.js        search, rendering, player, download
└── README.md
```

## Sources
| Source | Key needed | Media |
|---|---|---|
| Internet Archive | none | audio, video |
| Wikimedia Commons | none | audio, video |
| Jamendo | free `client_id` | audio |

Free Music Archive's public API is no longer dependable, so it is not included.
Only items with a Creative Commons or public-domain license are shown; each row links to its license. **Honor the attribution terms** (credit the creator, link the license) when you reuse a track.

## Reliability
- All sources are queried in parallel; one failing or slow source (8 s timeout) never blocks the rest.
- Each track carries an ordered list of source URLs (e.g. MP3, then Ogg). If one fails to play, the player moves to the next automatically.

## Run locally
ES modules need http, not `file://`:
```bash
cd open-media-hub
python3 -m http.server 8080      # or: npx serve .
```
Open http://localhost:8080. Optional: paste your Jamendo client_id into `js/config.js`.

## Deploy (all free)
**GitHub Pages**
1. Create a repo and push the folder contents (`index.html` at the repo root).
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
3. Live at `https://<user>.github.io/<repo>/` in about a minute.

**Netlify**
1. Go to app.netlify.com/drop and drag the `open-media-hub` folder in, or connect your GitHub repo.
2. If connecting a repo: build command empty, publish directory `.`

**Vercel**
1. `npm i -g vercel`, then run `vercel` inside the folder (or import the repo at vercel.com/new).
2. Framework preset: *Other*; build command empty; output directory `.`

## Notes
- Your Jamendo `client_id` is visible in the browser. That is normal for it, but keep it to read-only use.
- If a host you add later blocks cross-origin requests, put a small Express proxy in front of just that source and point its adapter at it.

## Install on Android / build an APK (free)
**Fastest: no APK needed.** Deploy the site (HTTPS is automatic on GitHub Pages, Netlify, Vercel), open it in Chrome on your phone, then menu → *Install app*. It gets a home-screen icon, runs full screen and opens offline.

**Real .apk file:**
1. Deploy the site and note its URL.
2. Go to pwabuilder.com, enter the URL, press *Package for stores* → *Android* → *Generate*.
3. Download the zip; it contains a signed `.apk` you can install directly (enable "install unknown apps" on the phone) and an `.aab` for Google Play.

**Saving music:** each result has *Save offline*. Files go into the app's browser storage on the phone and play with no internet from *My saved music*. Remove them there to free space. A few hosts block offline copies; use *Download* for those.
