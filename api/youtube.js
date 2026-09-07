/* ============================================================
   GET /api/youtube

   Live channel stats for the Watch page badge, so the subscriber
   count is never a number somebody has to remember to edit.

   Returns: { subscribers, videos, views, subscribersText, videosText,
              approximate, stale? }

   YouTube rounds public subscriber counts (1450 comes back as
   1450, but above 1000 the API itself rounds to 3 significant
   figures), so `subscribersText` is formatted the way YouTube
   displays it and `approximate` says so.

   Env vars:
     YOUTUBE_API_KEY     required. YouTube Data API v3 key.
     YOUTUBE_CHANNEL_ID  optional, defaults to the Wise Hearts channel.

   Caching: the response carries s-maxage=21600 (6h) so Vercel's
   edge serves nearly every hit without touching the API. The
   free Data API quota is 10,000 units/day and channels.list
   costs 1, so this stays free by a wide margin even if the cache
   is cold constantly.

   Failure is never fatal: any error returns 200 with ok:false so
   the page just keeps whatever number it rendered with.
   ============================================================ */

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || "UC9EZs-J9cPYn0ZTBkdCBK9A";
const TTL_SECONDS = 21600;   // 6 hours at the edge
const TIMEOUT_MS = 4000;

/* YouTube's own display rounding: 1450 -> "1.45K", 12300 -> "12.3K",
   1240000 -> "1.24M". Three significant figures, trailing zeros dropped. */
function formatCount(n) {
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1000) return String(n);
  const [div, suffix] = n < 1e6 ? [1e3, "K"] : [1e6, "M"];
  const scaled = n / div;
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${parseFloat(scaled.toFixed(digits))}${suffix}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    // Not configured yet. Say so plainly, but don't cache the miss for long.
    res.setHeader("Cache-Control", "public, s-maxage=60");
    return res.status(200).json({ ok: false, error: "YOUTUBE_API_KEY is not set" });
  }

  const url = "https://www.googleapis.com/youtube/v3/channels"
    + `?part=statistics&id=${encodeURIComponent(CHANNEL_ID)}&key=${encodeURIComponent(key)}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal });
    const body = await r.json().catch(() => ({}));

    if (!r.ok) {
      const reason = body?.error?.message || `YouTube API returned ${r.status}`;
      res.setHeader("Cache-Control", "public, s-maxage=300");
      return res.status(200).json({ ok: false, error: reason });
    }

    const stats = body?.items?.[0]?.statistics;
    if (!stats) {
      res.setHeader("Cache-Control", "public, s-maxage=300");
      return res.status(200).json({ ok: false, error: `No channel found for id ${CHANNEL_ID}` });
    }

    const subscribers = Number(stats.subscriberCount);
    const videos = Number(stats.videoCount);
    const views = Number(stats.viewCount);

    res.setHeader("Cache-Control",
      `public, s-maxage=${TTL_SECONDS}, stale-while-revalidate=${TTL_SECONDS * 4}`);
    return res.status(200).json({
      ok: true,
      subscribers,
      videos,
      views,
      subscribersText: formatCount(subscribers),
      videosText: formatCount(videos),
      // YouTube only publishes a rounded subscriber count above 1,000
      approximate: stats.hiddenSubscriberCount === true || subscribers >= 1000,
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    const aborted = err?.name === "AbortError";
    res.setHeader("Cache-Control", "public, s-maxage=60");
    return res.status(200).json({
      ok: false,
      error: aborted ? "YouTube API timed out" : String(err?.message || err)
    });
  } finally {
    clearTimeout(timer);
  }
};

module.exports.formatCount = formatCount;
