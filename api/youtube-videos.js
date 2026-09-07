/* ============================================================
   GET /api/youtube-videos

   The channel's full long-form library for the Watch page, so
   the video grid keeps itself current as Hilarey posts instead
   of being a hand-maintained list of embeds.

   Returns: { ok, count, videos: [{ id, title, duration, seconds,
              views, published, cat }] }, newest first.

   Shorts are excluded. YouTube caps a Short at 3 minutes, so
   anything longer is definitionally not one; MIN_SECONDS is the
   knob if that ever changes.

   Categories are guessed from the title (see CATEGORY_RULES).
   The Watch page overrides the guess for the videos it has a
   hand-written tag and blurb for, so curation always wins.

   Env vars:
     YOUTUBE_API_KEY     required, same key as /api/youtube
     YOUTUBE_CHANNEL_ID  optional, defaults to the Wise Hearts channel

   Quota: the channel has ~450 uploads, so a cold response costs
   about 18 of the 10,000 free daily units. The 6 hour edge cache
   means roughly 4 cold responses a day.

   Like /api/youtube, every failure returns 200 with ok:false so
   the page falls back to its built-in list instead of breaking.
   ============================================================ */

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || "UC9EZs-J9cPYn0ZTBkdCBK9A";
const MIN_SECONDS = 181;      // longer than the 3:00 Shorts ceiling
const TTL_SECONDS = 21600;    // 6 hours at the edge
const MAX_PAGES = 20;         // 1000 uploads, well past what we have
const TIMEOUT_MS = 8000;

/* Title keyword -> category. First match wins, so the most specific
   patterns come first. Mirrors the tab filters on the Watch page. */
const CATEGORY_RULES = [
  ["interviews",   /\b(with|w\/|interview|conversation|guest|feat\.?|ft\.?|remembering)\b/i],
  ["fiveelements", /\b(five element|5 element|wood|fire|earth element|metal element|water element|elemental)\b/i],
  ["facereading",  /\b(face|facial|mian|forehead|eyebrow|eyes|nose|lips|chin|cheek|jaw|ears?|wrinkle|lines|mole|features?)\b/i],
  ["acupuncture",  /\b(acupuncture|needle|meridian|herb|point|treatment|clinic|patient|pain|sleep|body|health|medicine|ozempic|skin)\b/i],
  ["taoist",       /\b(tao|dao|spirit|wisdom|shen|qi|energy|soul|purpose|meaning|philosoph|intuition|nature|season)\b/i]
];

function categorize(title) {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(title)) return cat;
  return "taoist";
}

/* PT1H2M3S -> 3723 */
function isoToSeconds(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

function secondsToClock(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = n => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

async function api(path, params, signal) {
  const qs = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${qs}`, { signal });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || `YouTube API returned ${r.status}`);
  return body;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!process.env.YOUTUBE_API_KEY) {
    res.setHeader("Cache-Control", "public, s-maxage=60");
    return res.status(200).json({ ok: false, error: "YOUTUBE_API_KEY is not set" });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    // The uploads playlist of any channel is its id with UC swapped for UU.
    const uploads = "UU" + CHANNEL_ID.slice(2);

    const items = [];
    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      const d = await api("playlistItems", {
        part: "snippet,contentDetails", playlistId: uploads,
        maxResults: "50", ...(pageToken ? { pageToken } : {})
      }, ac.signal);
      for (const it of d.items || []) {
        const id = it.contentDetails?.videoId;
        if (!id) continue;
        items.push({
          id,
          title: it.snippet?.title || "",
          published: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt || null
        });
      }
      pageToken = d.nextPageToken || "";
      if (!pageToken) break;
    }

    // Durations and view counts come from videos.list, 50 ids at a time.
    const byId = new Map(items.map(v => [v.id, v]));
    for (let i = 0; i < items.length; i += 50) {
      const chunk = items.slice(i, i + 50).map(v => v.id).join(",");
      const d = await api("videos", { part: "contentDetails,statistics", id: chunk }, ac.signal);
      for (const v of d.items || []) {
        const rec = byId.get(v.id);
        if (!rec) continue;
        rec.seconds = isoToSeconds(v.contentDetails?.duration);
        rec.views = Number(v.statistics?.viewCount) || 0;
      }
    }

    const videos = items
      .filter(v => (v.seconds || 0) >= MIN_SECONDS)
      .map(v => ({
        id: v.id,
        title: v.title,
        duration: secondsToClock(v.seconds),
        seconds: v.seconds,
        views: v.views || 0,
        published: v.published,
        cat: categorize(v.title)
      }));

    res.setHeader("Cache-Control",
      `public, s-maxage=${TTL_SECONDS}, stale-while-revalidate=${TTL_SECONDS * 4}`);
    return res.status(200).json({
      ok: true, count: videos.length, totalUploads: items.length,
      videos, fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    const aborted = err?.name === "AbortError";
    res.setHeader("Cache-Control", "public, s-maxage=120");
    return res.status(200).json({
      ok: false,
      error: aborted ? "YouTube API timed out" : String(err?.message || err)
    });
  } finally {
    clearTimeout(timer);
  }
};

module.exports._test = { isoToSeconds, secondsToClock, categorize };
