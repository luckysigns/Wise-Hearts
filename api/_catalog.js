/* ============================================================
   The shop's eight products, keyed by the slug the front-end
   sends. Stripe product ids live in env so a product can be
   re-created without a code change.

   `physical` drives shipping-address collection: the ear seeds
   go in the post, the e-books and readings do not. Prices are
   NOT listed here — they are read from Stripe at checkout time,
   so the page can never sell at a stale price.
   ============================================================ */

const CATALOG = {
  "vaccaria":    { env: "STRIPE_PRODUCT_VACCARIA_54",        physical: true  },
  "swarovski":   { env: "STRIPE_PRODUCT_SWAROVSKI_20",       physical: true  },
  "dualpack":    { env: "STRIPE_PRODUCT_DUAL_PACK_40",       physical: true  },
  "earseedbook": { env: "STRIPE_PRODUCT_EAR_SEEDS_EBOOK",    physical: false },
  "wisdomofyou": { env: "STRIPE_PRODUCT_WISDOM_OF_YOU",      physical: false },
  "mini":        { env: "STRIPE_PRODUCT_MINI_READING",       physical: false },
  "individual":  { env: "STRIPE_PRODUCT_INDIVIDUAL_READING", physical: false },
  "couples":     { env: "STRIPE_PRODUCT_COUPLES_READING",    physical: false }
};

function productIdFor(slug) {
  const entry = CATALOG[slug];
  if (!entry) return null;
  return process.env[entry.env] || null;
}

function isPhysical(slug) {
  return Boolean(CATALOG[slug] && CATALOG[slug].physical);
}

module.exports = { CATALOG, productIdFor, isPhysical };
