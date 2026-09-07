/* ============================================================
   GET /api/youtube-videos

   The channel's long-form library for the Watch page, so the
   grid keeps itself current as Hilarey posts instead of being a
   hand-maintained list of embeds.

   Returns: { ok, count, videos: [{ id, title, duration, seconds,
              views, published, cat }] }, newest first.

   --- Shorts ---
   Every one of the 387 Shorts on this channel is vertical and no
   longer than 3:00; all 88 real videos are landscape and the
   shortest is 2:06. So orientation decides it and duration never
   could: seven real videos are under three minutes, and an
   earlier duration rule silently ate them.

   Orientation comes from videos.list part=player with maxHeight
   set, which makes the API report embedWidth/embedHeight at the
   video's real aspect ratio. If that is ever missing we ask
   youtube.com/shorts/<id>, which answers 200 for a Short and
   redirects for anything else.

   --- Categories ---
   "Interviews" is exactly the Wise Heart Podcast playlist, not a
   title guess. The rest are scored against title, tags and
   description, with the title weighted heaviest. Five Elements
   deliberately covers both the element videos and the meridian
   and organ-clock ones.

   Note the scorer never matches a bare organ name: "heart" is in
   the channel's own name and appears in nearly every description.

   Env vars:
     YOUTUBE_API_KEY      required, same key as /api/youtube
     YOUTUBE_CHANNEL_ID   optional, defaults to the Wise Hearts channel
     YOUTUBE_PODCAST_LIST optional, the podcast playlist id

   Quota: about 85 of the 10,000 free daily units per cold call,
   and the 6 hour edge cache means roughly 4 of those a day.
   ============================================================ */

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || "UC9EZs-J9cPYn0ZTBkdCBK9A";
const PODCAST_LIST = process.env.YOUTUBE_PODCAST_LIST || "PLVSwh0el1qmQFBKI0sMJ93tf71NZlIHCP";
const TTL_SECONDS = 21600;
const MAX_PAGES = 20;
const PROBE_BATCH = 20;
const TIMEOUT_MS = 25000;

const ORGAN = "(small intestine|large intestine|gall ?bladder|triple (?:burner|heater)|" +
              "pericardium|spleen|liver|kidney|lung|stomach|bladder|heart)";

const RULES = [
  ["fiveelements", [
    [/\b(wood|fire|earth|metal|water)\s+(element|type|person|people|season|energy)/i, 6],
    [/\bfive\s*element|\b5\s*element|\belemental\b|\bthe\s+element\b|\belement\s+(of|in|type)/i, 6],
    [new RegExp(`\\b${ORGAN}('?s)?\\s+(meridian|channel|qi|energy|organ|system|time|clock|hour)`, "i"), 6],
    [/\bmeridian|\b(organ|body|chinese)\s+clock|\bacupuncture channel|\bhour by hour/i, 6],
    [/\b(spring|summer|autumn|winter|late summer)\b[^.]{0,40}\b(season|element|energy|qi)\b/i, 3]
  ]],
  ["facereading", [
    [/\bface reading|\bmian ?xiang|\bread(ing)? (a |your |the )?face|\bfacial\b|\bface map/i, 7],
    [/\b(forehead|eyebrow|eyelid|nose|lips?|chin|cheek|jaw|dimple|mole|philtrum|hairline|temples?)\b/i, 4],
    [/\b(11 lines|wrinkles?|features?)\b/i, 3],
    [/\byour face\b|\bthe face\b|\bfaces\b/i, 4]
  ]],
  ["acupuncture", [
    [/\bacupunctur|\bacupressure|\bacupoint|\bneedl|\bcupping|\bmoxa|\bear seed|\bacutonic|\btuning fork|\bgua sha|\bpressure points?/i, 7],
    [/\btreatment\b|\bclinic\b|\bpatient\b|\bherb|\bqi ?gong|\bdiagnos/i, 4],
    [/\b(pain|insomnia|digestion|fertility|menopause|immune|inflammation|ozempic)\b/i, 3]
  ]],
  ["taoist", [
    [/\btao\b|\btaoist|\bdao\b|\bdaoist|\bwu wei|\bshen\b|\bspirit(ual)?\b|\bsoul\b|\bconscious|\bphilosoph|\bpurpose\b|\bintuition|\bwisdom\b|\bdestiny|\bbazi|\bastrolog|\bmeditat|\bafterlife|\bayahuasca|\bhospice|\bming\b/i, 6],
    [/\b(meaning|gratitude|surrender|presence|mindset|self-?love|inner)\b/i, 2]
  ]]
];

// curly quotes would break \b...'s patterns, so flatten them first
const norm = s => String(s || "").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');

function categorize(title, description, tags) {
  const t = norm(title);
  const k = norm(Array.isArray(tags) ? tags.join(" ") : tags);
  const d = norm(description).slice(0, 400);
  let best = "taoist", bestScore = 0;
  for (const [cat, patterns] of RULES) {
    let score = 0;
    for (const [re, weight] of patterns) {
      if (re.test(t)) score += weight * 3;   // the title says the most
      if (re.test(k)) score += weight * 2;
      if (re.test(d)) score += weight;
    }
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

function isoToSeconds(iso) {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
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

async function allPlaylistItems(playlistId, signal) {
  const out = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const d = await api("playlistItems", {
      part: "contentDetails", playlistId, maxResults: "50",
      ...(pageToken ? { pageToken } : {})
    }, signal);
    for (const it of d.items || []) {
      const id = it.contentDetails?.videoId;
      if (id) out.push({ id, published: it.contentDetails?.videoPublishedAt || null });
    }
    pageToken = d.nextPageToken || "";
    if (!pageToken) break;
  }
  return out;
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
    const uploads = "UU" + CHANNEL_ID.slice(2);
    const items = await allPlaylistItems(uploads, ac.signal);
    const byId = new Map(items.map(v => [v.id, v]));

    // podcast episodes decide the Interviews tag; a failure here just
    // means nothing gets that tag, which is better than a wrong guess
    let podcast = new Set();
    try {
      podcast = new Set((await allPlaylistItems(PODCAST_LIST, ac.signal)).map(v => v.id));
    } catch { /* leave it empty */ }

    // maxHeight makes the API report the real aspect ratio in embedWidth/embedHeight
    for (let i = 0; i < items.length; i += 50) {
      const chunk = items.slice(i, i + 50).map(v => v.id).join(",");
      const d = await api("videos", {
        part: "contentDetails,statistics,snippet,player",
        id: chunk, maxHeight: "720"
      }, ac.signal);
      for (const v of d.items || []) {
        const rec = byId.get(v.id);
        if (!rec) continue;
        rec.seconds = isoToSeconds(v.contentDetails?.duration);
        rec.views = Number(v.statistics?.viewCount) || 0;
        rec.title = v.snippet?.title || "";
        rec.description = v.snippet?.description || "";
        rec.tags = v.snippet?.tags || [];
        const w = Number(v.player?.embedWidth), h = Number(v.player?.embedHeight);
        rec.vertical = (w > 0 && h > 0) ? h > w : null;   // null = could not tell
      }
    }

    // fall back to asking YouTube for anything the player part did not describe
    const unknown = items.filter(v => v.vertical === null || v.vertical === undefined);
    for (let i = 0; i < unknown.length; i += PROBE_BATCH) {
      await Promise.all(unknown.slice(i, i + PROBE_BATCH).map(async v => {
        try {
          const r = await fetch(`https://www.youtube.com/shorts/${v.id}`,
            { method: "HEAD", redirect: "manual", signal: ac.signal });
          v.vertical = r.status === 200;          // 200 = the Shorts player served it
        } catch {
          v.vertical = (v.seconds || 0) <= 180;   // last resort: the old duration guess
        }
      }));
    }

    const videos = items
      .filter(v => v.vertical === false && v.title)
      .map(v => ({
        id: v.id,
        title: v.title,
        duration: secondsToClock(v.seconds || 0),
        seconds: v.seconds || 0,
        views: v.views || 0,
        published: v.published,
        cat: podcast.has(v.id) ? "interviews" : categorize(v.title, v.description, v.tags)
      }));

    res.setHeader("Cache-Control",
      `public, s-maxage=${TTL_SECONDS}, stale-while-revalidate=${TTL_SECONDS * 4}`);
    return res.status(200).json({
      ok: true, count: videos.length, totalUploads: items.length,
      shortsExcluded: items.length - videos.length, probed: unknown.length,
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

module.exports._test = { isoToSeconds, secondsToClock, categorize, norm };
