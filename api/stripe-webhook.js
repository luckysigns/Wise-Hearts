/* ============================================================
   POST /api/stripe-webhook
   Stripe calls this; nothing else should. Verifies the Stripe
   signature, then emails the buyer any ebook that came with what
   they bought.

   Events handled:
     checkout.session.completed   (payment succeeded)

   Orders containing only face-reading sessions send no email —
   there is no file to deliver; Hilarey books those by hand.

   Stripe retries on any non-2xx, so a delivery failure is worth
   reporting back as a 500: the retry is the safety net. That makes
   delivery at-least-once, and a duplicate ebook is a far smaller
   problem than a missing one.

   Env vars required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
   SMTP_USER, SMTP_PASS, and the five STRIPE_PRODUCT_* ids
   (see _fulfillment.js).
   ============================================================ */

const Stripe = require("stripe");

const { ebookForProduct } = require("./_fulfillment");
const { sendEbook } = require("./_email");

/* Built on first request, not at import. Constructing Stripe up top
   throws when the key is missing, which takes the whole function down
   at cold start and surfaces as an opaque 500 — no signal about which
   variable is actually absent. */
let _stripe;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function firstNameOf(session) {
  const full =
    session.customer_details?.name || session.shipping_details?.name || "";
  return full.trim().split(/\s+/)[0] || null;
}

/* Every distinct ebook in the order — the Dual Pack and a solo pack
   in one basket should not send the same guide twice. */
async function ebooksInSession(sessionId) {
  const items = await getStripe().checkout.sessions.listLineItems(sessionId, {
    limit: 100,
    expand: ["data.price.product"]
  });

  const byFile = new Map();
  for (const item of items.data) {
    const product = item.price?.product;
    const id = typeof product === "string" ? product : product?.id;
    const ebook = ebookForProduct(id);
    if (ebook) byFile.set(ebook.file, ebook);
  }
  return [...byFile.values()];
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      await rawBody(req),
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    // Either the config is wrong or the request did not come from Stripe.
    // A missing secret is ours to fix, so it must not read as a bad caller.
    const misconfigured = /is not set/.test(err.message);
    console.error("[stripe-webhook] rejected:", err.message);
    return misconfigured
      ? res.status(500).json({ error: "Server misconfigured" })
      : res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const session = event.data.object;

  // A session can complete unpaid (e.g. an async payment still clearing).
  if (session.payment_status !== "paid") {
    console.log(
      `[stripe-webhook] ${session.id} completed but payment_status=${session.payment_status}; nothing sent`
    );
    return res.status(200).json({ received: true, deferred: true });
  }

  const to = session.customer_details?.email;
  if (!to) {
    console.error(`[stripe-webhook] ${session.id} has no customer email`);
    return res.status(200).json({ received: true, noEmail: true });
  }

  try {
    const ebooks = await ebooksInSession(session.id);
    if (!ebooks.length) {
      console.log(`[stripe-webhook] ${session.id}: no ebook in this order`);
      return res.status(200).json({ received: true, ebooks: 0 });
    }

    const firstName = firstNameOf(session);
    for (const ebook of ebooks) {
      await sendEbook({ to, firstName, ebook });
      console.log(`[stripe-webhook] ${session.id}: sent "${ebook.title}" to ${to}`);
    }

    return res.status(200).json({ received: true, ebooks: ebooks.length });
  } catch (err) {
    // 500 tells Stripe to retry — better a second copy than none.
    console.error(`[stripe-webhook] ${session.id} delivery failed:`, err);
    return res.status(500).json({ error: "Delivery failed" });
  }
};

/* Stripe signs the raw request body, so Vercel must not parse it first.
   This has to be assigned AFTER the handler above: `module.exports = fn`
   replaces the whole exports object and would drop anything set before it. */
module.exports.config = { api: { bodyParser: false } };
