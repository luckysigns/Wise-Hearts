/* ============================================================
   POST /api/checkout
   The shop cart posts its contents here; we build a Stripe
   Checkout Session and hand back the URL to send the buyer to.

   Body: { items: [{ slug, qty }] }
   Returns: { url }

   Prices are read from Stripe, never from the request — a page
   that has been edited in the browser still gets charged the
   real amount. The client only ever chooses *which* product and
   *how many*.

   Shipping is collected only when the basket holds something
   that physically ships (the ear seeds). E-books and readings
   need no address.

   Env vars: STRIPE_SECRET_KEY, the eight STRIPE_PRODUCT_* ids
   (see _catalog.js), and optionally SITE_URL for the return
   links — the request's own origin is used when it is absent.
   ============================================================ */

const Stripe = require("stripe");
const { productIdFor, isPhysical } = require("./_catalog");

const MAX_QTY = 20;          // a shop this size never legitimately needs more
const SHIP_TO = ["US"];      // ear seeds go US-only for now

let _stripe;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;  // already parsed
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function originOf(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${req.headers.host}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let items;
  try {
    ({ items } = await readJson(req));
  } catch {
    return res.status(400).json({ error: "Malformed request body" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Your cart is empty." });
  }

  // Collapse duplicates so two "add to cart" clicks become quantity 2,
  // not two identical line items.
  const wanted = new Map();
  for (const item of items) {
    const slug = String(item && item.slug || "");
    const productId = productIdFor(slug);
    if (!productId) return res.status(400).json({ error: `Unknown product: ${slug}` });

    const qty = Math.floor(Number(item.qty) || 1);
    if (qty < 1 || qty > MAX_QTY) {
      return res.status(400).json({ error: `Quantity for ${slug} must be between 1 and ${MAX_QTY}.` });
    }
    const prev = wanted.get(slug) || { productId, qty: 0 };
    prev.qty = Math.min(prev.qty + qty, MAX_QTY);
    wanted.set(slug, prev);
  }

  try {
    const stripe = getStripe();

    // Ask Stripe for each product's current default price.
    const line_items = await Promise.all(
      [...wanted.entries()].map(async ([slug, { productId, qty }]) => {
        const product = await stripe.products.retrieve(productId, { expand: ["default_price"] });
        const price = product.default_price;
        if (!price || !price.active) throw new Error(`No active price for ${slug}`);
        return { price: price.id, quantity: qty };
      })
    );

    const needsShipping = [...wanted.keys()].some(isPhysical);
    const origin = originOf(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${origin}/shop?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop?canceled=1`,
      // the receipt and the ebook both need somewhere to go
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      ...(needsShipping ? { shipping_address_collection: { allowed_countries: SHIP_TO } } : {})
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("[checkout] failed:", err);
    const misconfigured = /is not set|No active price/.test(err.message || "");
    return res.status(misconfigured ? 500 : 502).json({
      error: "Could not start checkout. Please try again, or email us and we'll take the order by hand."
    });
  }
};
