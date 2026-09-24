# MockDuo

Start the project with `unlocalhost up duosimulator` and restart it after changes with `unlocalhost restart duosimulator`.

## Credits and third-party assets

- The 3D viewer is based on the [original iPhone Duo project](https://github.com/chuspeeism/iphone-duo). Its MIT license and copyright notice are included in [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt).
- The iPhone Duo model and textures come from [Apple's iPhone Duo page](https://www.apple.com/iphone-duo/). These assets are separate from the MIT-licensed viewer code.
- The bundled [Three.js](public/duo3d/vendor/three/LICENSE) and [fflate](public/duo3d/vendor/three/examples/jsm/libs/fflate.LICENSE) license texts are kept alongside their files.
- Website screenshots use [ScreenshotOne](https://screenshotone.com/?via=mockduo). The app does not launch a browser to capture pages.

## ScreenshotOne

To use ScreenshotOne, copy `.env.example` to `.env` and set `SCREENSHOTONE_ACCESS_KEY` to your access key. Then run `unlocalhost restart duosimulator`. The key is used only by the screenshot server and is never sent to the browser.

Website screenshots are stored in `server/cache/`, one per URL and viewport size. The two Duo displays therefore require two initial captures per URL. Later requests and restarts reuse the cached files without calling the API. To refresh a site, delete the files in `server/cache/` (or empty the directory). The access key is required for new captures.

The server also reads the previous `site-v5` cache names. You can copy existing PNGs from `server/cache/` into the production cache directory without using ScreenshotOne credits. The old `server/cache/composed/` images are no longer used. Set `SHOT_CACHE_DIR` to a directory outside Forge's release folders so copied files survive deployments.

The visitor's browser draws the ScreenshotOne images and Safari controls into one canvas for each 3D display. The server only forwards and caches ScreenshotOne's PNGs.

ScreenshotOne requests set `block_cookie_banners=true` and `block_ads=true`.

## Gallery

Sites entered in the form are logged in a SQLite database (`server/data/sites.db`,
or `SITES_DB_PATH`) once both displays have loaded, and listed in the **Gallery**
modal. Sites opened from a link or from the gallery are not logged. The server
accepts `POST /api/sites` only for URLs whose screenshot is already cached, with
10 submissions per minute per client IP. `GET /api/sites?sort=recent|popular`
returns the list. The database uses Node's built-in `node:sqlite` (Node 22.13+).

The home page shows the most recently submitted site. **Claim it** opens the
form; submitting a site makes it the new home page. Resubmitting the site that is
already on the home page is rejected (HTTP 409). Each site also has a path URL:
`/example.com` or `/example.com/page` opens that site. To import existing sites, one URL or domain per line:

```bash
node scripts/import-sites.mjs sites.txt
```

## Screenshot endpoint limits

`/shot.png` accepts only public HTTP(S) destinations. The server allows 30 screenshot
requests and 10 new captures per minute per client IP, 60 new captures per
minute in total, one active capture and 10 waiting captures. Images are capped
at 32 MiB and the disk cache is trimmed to 512 MiB. Excess requests return
HTTP 429 or 503. Production deployments should also deny private network
egress for the ScreenshotOne proxy process.

When Nginx proxies `/shot.png`, set `SHOT_TRUST_PROXY=1` only if Nginx replaces
`X-Real-IP` with the actual client IP. Otherwise the server uses the socket IP
for its limits. Run `npm test` to check URL filtering, rate limits, and queueing.

ScreenshotOne captures the site at 3× density. The site content occupies 951×588 pixels
below the top bar in the open view, and 382×678 pixels beside the controls
rail in the closed view. For Dailygram, the declared Figtree web font is loaded
so remote capture does not depend on fonts installed on the server.
