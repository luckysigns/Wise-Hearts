# Wise Hearts Connect: Project Context

Read this first. It carries the decisions and constraints from the build so far.
Last updated 7 Sep 2026 (SEO + page-speed pass).

## Who / what

- **Business:** Wise Hearts Connect (plural "Hearts"). YouTube handle `@WiseHeartsConnect`.
- **Practitioner:** Hilarey Boly, licensed acupuncturist (Oregon & Washington, since 2007)
  and Chinese face reader, based in Portland, Oregon.
- **Client contact:** wiseheartsconnected@gmail.com
- **Built by:** Lachlan Sforcina (reVisual Media / CreatorApps), producer for the channel.

## Face reading framing (important)

Hilarey rarely uses the term "Mian Xiang." Her face reading training comes from
**Lillian Pearl Bridges (1956 to 2021)**, founder of **The Lotus Institute**. When writing
copy, credit that lineage: "the tradition taught by Lillian Pearl Bridges," "rooted in the
Lotus Institute," or plainly "Chinese face reading and the Five Elements." Do not lead with
"Mian Xiang."

Acupuncture is Hilarey's **separate licensed clinical practice** (booked via acu4you.net),
not part of the Wise Hearts booking flow. Keep them distinct.

## Brand system

Palette derived from the logo (clay rose):

| Token | Hex | Use |
|---|---|---|
| Clay Rose | `#D9877B` | Primary brand color, accents, eyebrows |
| Deep Rose | `#C26F63` | Buttons/links (clay rose alone fails contrast) |
| Blush | `#F2D9D2` | Soft section backgrounds |
| Blush Deep | `#E9C4BA` | Borders, hover |
| Cream | `#FBF6F3` | Page background |
| Cream Warm | `#F5EBE5` | Alternating sections |
| Cocoa Ink | `#3A2F2C` | Headings + body text (never pure black) |
| Taupe | `#8C6F68` | Muted text, labels |
| Warm Dark | `#2E2522` | Hero + footer |

- **Type:** Cormorant Garamond (display, often one italic emphasis line per headline)
  + Inter (body). Loaded from Google Fonts via `<link>` tags in each page head.
- **Motif:** two-tone lotus divider between sections.
- **Logo:** `assets/wiseheart-logo.png` is the master (637x516, pink on transparent).
  Pages use `assets/wiseheart-logo-nav.png` (207x168, 6KB) in the nav and footer.
  Icons: `favicon.ico`, `assets/favicon-96.png`, `assets/favicon-192.png`,
  `assets/apple-touch-icon.png`. Social card: `assets/og-image.jpg` (1200x630).
- Feel: warm, credible, grounded. Licensed practitioner first, creator second.
  Never clinical, never "witchy."
- A packaged brand skill exists (`wiseheart-brand.skill`) with the same tokens. It still
  says "Wise Heart" singular and describes the old Hostinger plan; this file wins.

## Site structure

`index` · `about` · `services` · `face-reading/` (interactive app) · `media` (YouTube hub)
· `booking` · `shop` · `contact`

Nav order: Home, About, Services, Read My Face, Watch, Shop, Contact + "Book a Session" CTA.

Internal links use clean URLs (`/about`, `/services#virtual`, `/booking?service=virtual`,
`/face-reading`), never `about.html`. Vercel `cleanUrls` serves them and 308-redirects
the `.html` forms, so linking to `.html` would cost a redirect on every click.

## Technical state

- Plain static HTML plus two Vercel serverless functions in `api/`. **No build step.**
- Shared CSS is linked as `/brand.css` (the brand system, mobile menu included).
  Page-specific CSS stays inline in each page's second `<style>` block. Pages are 20 to 40KB.
  (Until Sep 2026 the CSS and a base64 logo were inlined into every page, ~350KB each,
  so files rendered in macOS Quick Look. That is gone: open pages through a server or
  the live site, not straight from Finder.)
- **Hosting:** GitHub `luckysigns/Wise-Hearts` (public, branch `main`) auto-deploys to
  Vercel, project `wise-hearts-connect`, live at **https://wiseheartsconnect.com**.
  `vercel.json`: cleanUrls, trailingSlash false, security headers, cache headers for
  `/assets/*` (30 days) and `/brand.css` (1 hour), `Permissions-Policy` allows the camera
  for the face-reading app's webcam capture. `netlify.toml` was removed.
- Local working folder: iCloud → `Claude/wiseheartsconnect`. `tools/` (YouTube Shorts
  thumbnail pipeline, see `tools/HANDOFF.md`), `thumbnail-samples/`, `archive/` and
  `*.zip` are gitignored and never deploy.
- **Shop is live on Stripe.** `shop.html` posts the cart (slug + qty only) to
  `/api/checkout`, which prices it from Stripe and returns a hosted Checkout URL.
  `/api/stripe-webhook` fulfils orders: e-book PDFs in `api/_ebooks/` go out by email
  (nodemailer, SMTP settings in Vercel env). Catalog of 8 products in `api/_catalog.js`:
  Vaccaria 54-pack, Swarovski 20-pack, Dual Pack, two e-books (Ear Seeds guide, The Wisdom
  of You early bird), and Mini / Individual / Couples face readings. Stripe product IDs and
  keys live in Vercel env vars, never in the repo. Product photos are real, in
  `assets/products/`.
- **Face reading app** at `/face-reading` is a single-file app (Learn / Scan / Mirror /
  Your Reading). Photo upload and a desktop webcam capture feed the same scan flow.
- Photos of Hilarey and the practice are local in `assets/` (`hilarey.jpg`, `hilarey/`,
  `services/`). Nothing is hotlinked except the Pexels hero video on the home page and
  the YouTube embeds.
- Watch page lists the 20 most watched long-form videos with a working topic filter.
  Home page features three real videos, equal thirds. No placeholder IDs remain.
- **Watch page is data-driven.** `/api/youtube-videos` returns the channel's whole
  long-form library (90 videos as of Sep 2026) from the YouTube Data API and guesses a
  category from the title. **Shorts never appear on the site.** Duration alone cannot
  decide that: a Short is capped at 3 minutes but two real videos are 2:43 and 2:52, so
  anything at or under 60s is dropped outright, anything over 3 minutes is kept, and the
  band between is checked against `youtube.com/shorts/<id>`, which answers 200 for a real
  Short and redirects for a normal video. The page ships with the 20
  hand-written cards baked into `media.html` as `CURATED`, which is what crawlers and a
  keyless deploy see; when the API answers, curated entries keep their tag and blurb and
  the rest are appended. 12 cards render at a time behind a Load more button.
  Cards are click-to-play posters, not iframes: an embedded YouTube player costs about a
  megabyte of script, so 88 live iframes would never load. The iframe is built on click.
  To re-curate, edit the `CURATED` array near the bottom of `media.html`.
- **Live subscriber count.** The Watch page badge fetches `/api/youtube`, which calls the
  YouTube Data API and is cached at Vercel's edge for 6 hours. The number in the HTML
  (`#ytStats`) is the fallback shown to crawlers and whenever the call fails, so keep it
  roughly current. Channel id `UC9EZs-J9cPYn0ZTBkdCBK9A`.
  Both YouTube endpoints share one key. Setup: console.cloud.google.com -> new or existing project -> APIs & Services ->
  enable "YouTube Data API v3" -> Credentials -> Create credentials -> API key ->
  restrict it to that one API -> add it to Vercel as `YOUTUBE_API_KEY` (all environments)
  and redeploy. Optional `YOUTUBE_CHANNEL_ID` overrides the default. Free tier is 10,000
  units a day and this costs 1 unit per cache miss, so roughly 4 a day.
  Until the key is set the endpoint returns `{ok:false}` and the badge just keeps the
  static number, so nothing breaks in the meantime.

## SEO (done Sep 2026, on the current pages)

- Per-page titles and descriptions written for local Portland intent, kept under ~60
  characters where possible, no em dashes.
- Every page: canonical (clean URL), robots meta, author, geo tags, theme-color,
  Open Graph + Twitter cards pointing at `assets/og-image.jpg`, favicon set,
  preconnect + `<link>` for Google Fonts.
- JSON-LD (`@graph` per page): `WebSite` + `HealthAndBeautyBusiness` + `Person` on the
  home page (shared `@id`s `/#business` and `/#hilarey`), `Person` on about, three
  `Service` entries on services, `ItemList` of 8 `Product`s (prices mirror the page) on
  shop, `FAQPage` mirroring the five visible FAQs on contact, `WebApplication` on
  face-reading, `BreadcrumbList` on every inner page.
- `sitemap.xml` (8 clean URLs with lastmod) and `robots.txt` (allows all, blocks `/api/`,
  points at the sitemap).
- All canonical/sitemap URLs point to `https://wiseheartsconnect.com`, never the Vercel
  preview URL. Submit the sitemap in Google Search Console once deployed.
- When a page's copy or a product price changes, update the matching JSON-LD in that
  page's head, and bump `lastmod` in `sitemap.xml`.

## Open items

1. **Booking form does not send anywhere.** `booking.html` still POSTs Netlify-style to
   `/` and then shows the success panel no matter what, so on Vercel a booking is lost
   silently. Fix: an `/api/book` function that emails Hilarey with the same nodemailer
   SMTP setup the Stripe webhook already uses, and make the form wait for a 200.
2. **Newsletter opt-in is a dead input** (home page "Season Change Notes" box has no
   handler). Needs a list provider or a small `/api/subscribe`.
3. **`YOUTUBE_API_KEY` is not set in Vercel yet**, so the Watch page still shows the 20
   curated videos and the static subscriber number. Setting it turns on the full 88 video
   library and the live count. See the setup steps above.
4. Hilarey's portrait: `assets/hilarey.jpg` is what ships. Lachlan flagged the earlier
   photo as not the preferred one; confirm this is the image she wants.
5. Pexels hero video on the home page is a hotlinked 1280x720 MP4. Fine for now; a
   locally hosted, compressed clip (or a poster image on mobile) would help LCP.

## Working preferences

Casual, direct. Complete working code in one shot. No em dashes. Plain warm human
writing, no AI-sounding filler.
