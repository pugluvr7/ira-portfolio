// The joke sample portfolio. New accounts start empty; the Edit portfolio page
// offers a "Load the joke sample" button that copies these holdings into the database.
window.SAMPLE_PORTFOLIO = {
  account: {
    name: "Roth IRA",
    owner: "My Retirement",
    custodian: "Brokerage",
    asOf: "2026-11-02",
  },

  // Annual contribution tracking
  contributions: {
    year: 2026,
    limit: 7500, // IRS limit for under-50 in 2026; add catch-up if 50+
    contributedYTD: 5000,
    // Total of all contributions ever made (used for "contributed" line)
    lifetime: 32000,
  },

  // Target allocation by asset class (percent, should sum to 100).
  // Order sets chart colors: plum, teal, gold, blue, rose.
  targets: {
    "Stocks": 35,
    "Seafood": 20,
    "Precious Metals": 20,
    "Real Estate": 15,
    "Cash": 10,
  },

  // Holdings. costBasis is the total amount paid for the position.
  // picture: an emoji, or set `image: "path/or/url.jpg"` to use a real photo instead.
  // unit: what one "share" is called; note: caption shown on the Asset visualization page.
  holdings: [
    { symbol: "VTI",   name: "Vanguard Total Stock Market ETF",       assetClass: "Stocks",          shares: 40,    price: 318.42, costBasis: 10500, dayChangePct: 0.62,
      picture: "📈", unit: "shares",       note: "The one normal thing in here." },
    { symbol: "BROTH", name: "Chicken Stock, 32 oz cartons",          assetClass: "Stocks",          shares: 600,   price: 3.49,   costBasis: 1800,  dayChangePct: 1.85,
      picture: "🐔", unit: "cartons",      note: "Diversified across low-sodium and regular." },
    { symbol: "LOBS",  name: "Live Maine Lobsters (in the bathtub)",  assetClass: "Seafood",         shares: 85,    price: 42.00,  costBasis: 3900,  dayChangePct: -2.40,
      picture: "🦞", unit: "lobsters",     note: "Down today. Two escaped." },
    { symbol: "SHRMP", name: "Costco Frozen Shrimp Rings",            assetClass: "Seafood",         shares: 140,   price: 24.99,  costBasis: 3200,  dayChangePct: 0.35,
      picture: "🍤", unit: "shrimp rings", note: "Cocktail sauce held separately." },
    { symbol: "GOLD",  name: "1 oz Gold Bars (sock drawer)",          assetClass: "Precious Metals", shares: 2,     price: 4012.50, costBasis: 5200, dayChangePct: 0.91,
      picture: "🧈", unit: "bars",         note: "Not butter. Please stop asking." },
    { symbol: "PNNY",  name: "Pre-1982 Copper Pennies (pickle jar)",  assetClass: "Precious Metals", shares: 40000, price: 0.03,   costBasis: 400,   dayChangePct: 0,
      picture: "🪙", unit: "pennies",      note: "Jar still smells faintly of dill." },
    { symbol: "SHED",  name: "Backyard Shed, slightly haunted",       assetClass: "Real Estate",     shares: 1,     price: 6500,   costBasis: 4200,  dayChangePct: 0,
      picture: "🛖", unit: "shed",         note: "Ghost pays no rent." },
    { symbol: "LAIRD", name: "1 sq ft of Scotland (comes with title)", assetClass: "Real Estate",    shares: 4,     price: 37.50,  costBasis: 199,   dayChangePct: -0.12,
      picture: "🏰", unit: "sq ft",        note: "Please address her as Lady Wendy." },
    { symbol: "MTRS",  name: "Cash Under the Mattress",               assetClass: "Cash",            shares: 4100,  price: 1.00,   costBasis: 4100,  dayChangePct: 0,
      picture: "🛏️", unit: "dollars",      note: "FDIC insured (Firmly Dozing In Comfort)." },
    { symbol: "COAT",  name: "Found in Last Winter's Coat Pocket",    assetClass: "Cash",            shares: 37.25, price: 1.00,   costBasis: 37.25, dayChangePct: 0,
      picture: "🧥", unit: "dollars",      note: "Plus one mystery receipt." },
  ],
};
