/* ============================================================
   Which ebook ships with which product, and how it gets sent.

   Keyed by Stripe product id (prod_...). Set these in Vercel env
   so a product can be re-created in Stripe without a code change.
   A product with no entry here simply gets no email — that is the
   case for the three face-reading sessions, which Hilarey books
   by hand.
   ============================================================ */

const path = require("path");

// file lives in api/_ebooks/ — under /api, so Vercel never serves it
// statically. vercel.json includeFiles pulls it into the bundle.
const EBOOKS = {
  earSeeds: {
    file: path.join(__dirname, "_ebooks", "ear-seeds-guide.pdf"),
    filename: "Ear Seeds - Your Guide to Self-Healing Through the Ear.pdf",
    title: "Ear Seeds: Your Guide to Self-Healing Through the Ear"
  },
  wisdomOfYou: {
    file: path.join(__dirname, "_ebooks", "wisdom-of-you.pdf"),
    filename: "The Wisdom of You - Face Reading.pdf",
    title: "The Wisdom of You — Early Bird Edition"
  }
};

// prod_... -> ebook key. Env vars keep the ids out of the repo.
function ebookForProduct(productId) {
  if (!productId) return null;
  const map = {
    [process.env.STRIPE_PRODUCT_EAR_SEEDS_EBOOK]: "earSeeds",
    [process.env.STRIPE_PRODUCT_VACCARIA_54]: "earSeeds",
    [process.env.STRIPE_PRODUCT_SWAROVSKI_20]: "earSeeds",
    [process.env.STRIPE_PRODUCT_DUAL_PACK_40]: "earSeeds",
    [process.env.STRIPE_PRODUCT_WISDOM_OF_YOU]: "wisdomOfYou"
  };
  const key = map[productId];
  return key ? EBOOKS[key] : null;
}

module.exports = { EBOOKS, ebookForProduct };
