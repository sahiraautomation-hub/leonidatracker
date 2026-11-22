# LeonidaTracker

A static GTA 6 fan utility site: a 100% tracker, a cheats database, calculators and 30 pSEO guides.
It is pure HTML, CSS and vanilla JS, with no backend and no npm dependencies.

## Build

```bash
node scripts/build.js          # compiles everything into deploy/
node scripts/serve.js          # optional local preview at http://localhost:8080
```

You need Node 18 or newer. The build is deterministic: the same data always produces the same files.
It also checks itself and stops with an error if:

- a data file references a missing id
- an internal link or asset is broken
- a table-of-contents anchor is missing
- two pages share the same `<title>`

## Before you upload

1. Open `site.config.json` and set:
   - `url`: your real domain, e.g. `https://leonidatracker.com` (no trailing slash)
   - `email`: a real inbox. It appears on the Contact, Privacy and Terms pages.
   - `lastUpdated`: the date you last checked the data. It drives the sitemap `lastmod`.
2. Run `node scripts/build.js` again.

## Publishing (GitHub to Hostinger)

`main` holds the source and `live` holds the built site. Hostinger deploys the `live` branch to `public_html` on every push.

```bash
bash scripts/publish.sh "What changed"   # builds, then pushes deploy/ to live
```

Rules for automated daily updates are in `CLAUDE.md`. Topics still to write are in `BACKLOG.md`.

## Manual deploy to Hostinger (fallback)

1. In hPanel, open **File Manager** and go to `public_html`.
2. Upload the **contents** of `deploy/`, not the folder itself. Include the hidden `.htaccess` file.
3. Visit `https://yourdomain.com/sitemap.xml` and submit it in Google Search Console.

The `.htaccess` file does the following:

- forces HTTPS
- removes `www`
- adds trailing slashes
- serves the custom 404 page
- turns on compression and long-term caching for assets (assets are cache-busted with `?v=hash`)

## AdSense

1. **Applying:** put your publisher ID in `site.config.json` under `adsense.client` (e.g. `ca-pub-1234567890123456`) and rebuild. This does two things:
   - adds the AdSense script to every `<head>`
   - generates `ads.txt`
2. **After approval:** create ad units in AdSense and paste their slot IDs into `adsense.slots`. The four slots are `top`, `inContent`, `sidebar` and `bottom`.
   - An ad container is only rendered when its slot ID is set, so the review never sees empty boxes.
   - Space is reserved in CSS to avoid layout shift.
3. **EEA/UK consent:** turn on Google's consent message in AdSense, under **Privacy & messaging**. The privacy policy already describes it.

You can also pass the values at build time without editing the file:

```bash
SITE_URL=https://example.com ADSENSE_CLIENT=ca-pub-123 node scripts/build.js
```

## Updating content

| What | File |
|---|---|
| A cheat code is found | `data/cheats.json`: set `"code": ["U","D","L","R",...]` |
| Tracker items / counts | `data/tracker-items.json` |
| 100% requirements | `completionRequirements` in `data/tracker-items.json` |
| Per-cheat pages | Automatic: every cheat with a `code` gets `/cheats/<id>/` (skipped when a dedicated guide exists, see `DEDICATED_GUIDE` in `scripts/build.js`) |
| Changelog / homepage "Latest updates" | `data/updates.json`: add an entry at the top each time you verify or add something |
| Author byline | `author` in `site.config.json`. Use `{ "name": "Your Name", "type": "Person" }` for a real-person byline |
| Social share image | `src/assets/og-image.png` (1200x630) |
| Guides (pSEO pages) | `data/keywords.json`: add an object to `guides` and the page, sitemap entry and internal links are generated |
| Look and feel | `src/assets/styles.css` |
| Header, footer, ad markup | `src/templates/layout.js` |
| Tracker / filter / save logic | `src/assets/app.js` |

### Guide data blocks

A guide's `data` field renders a live table from the JSON. The block types are:

- `{ "type": "cheats", "filter": { "category": "combat" } }`, or `{ "ids": [...] }`, or `{ "known": true }`
- `{ "type": "counters", "filter": { "ids": [...] } }`, or `{ "cat": "collectibles" }`
- `{ "type": "missions", "filter": { "chapterPrefix": "Chapter 1" } }`

Short cheat and counter lists also generate per-item notes. These are built from the data itself:

- codes with a shared opener
- counters that unlock more than one cheat
- 100% requirements

## Data notes (verified 2026-11-22)

- **Cheats:** all 61 cheats with their unlock challenges. Only the 18 D-pad codes that matched across several independent launch-week sources are filled in. The rest show "Code not found yet".
- **Missions:** Chapter 1 (22 main missions) and Chapter 2 (11) are listed, plus Billy's five optional missions. Later mission names are heavy spoilers, so the Tracker uses one milestone for finishing the story.
- **Chapter 3 name:** not displayed, because it contains crude language that could trip AdSense content review. The matching trophy is left out for the same reason.
- **Payouts and prices:** money figures in the guides (car sales, jewelry stores, vaults, garages, guns) come from launch-week guides and are worded as "reported". Update them if Rockstar patches values.
- **Single-source facts** are either left out or marked as reported. Research notes are not shipped with the site.
- **Cocaine Flamingos:** the 100-of-125 requirement for 100% is marked as community-reported.

## Saves

Progress is stored in `localStorage` under `leonidatracker:v1`. Export and import use a `LT1:` prefix followed by Base64-encoded JSON.
Imports are validated: ids are whitelisted and numbers are clamped.
