// Portfolio data — edit this file to reflect your real account.
// Everything on the page is derived from what's here.
window.PORTFOLIO = {
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
    lifetime: 44000,
  },

  // Target allocation by asset class (percent, should sum to 100)
  targets: {
    "US Stocks": 55,
    "International Stocks": 20,
    "Bonds": 15,
    "Real Estate": 5,
    "Cash": 5,
  },

  // Holdings. costBasis is the total amount paid for the position.
  holdings: [
    { symbol: "VTI",   name: "Vanguard Total Stock Market ETF",     assetClass: "US Stocks",            shares: 92.4,  price: 318.42, costBasis: 21250, dayChangePct: 0.62 },
    { symbol: "SCHD",  name: "Schwab US Dividend Equity ETF",       assetClass: "US Stocks",            shares: 140,   price: 29.85,  costBasis: 3820,  dayChangePct: 0.21 },
    { symbol: "VXUS",  name: "Vanguard Total International Stock",  assetClass: "International Stocks", shares: 168.2, price: 71.10,  costBasis: 10100, dayChangePct: -0.34 },
    { symbol: "BND",   name: "Vanguard Total Bond Market ETF",      assetClass: "Bonds",                shares: 104,   price: 74.62,  costBasis: 7900,  dayChangePct: 0.08 },
    { symbol: "VNQ",   name: "Vanguard Real Estate ETF",            assetClass: "Real Estate",          shares: 28.5,  price: 93.40,  costBasis: 2500,  dayChangePct: -0.71 },
    { symbol: "SPAXX", name: "Fidelity Government Money Market",    assetClass: "Cash",                 shares: 2210,  price: 1.00,   costBasis: 2210,  dayChangePct: 0 },
  ],
};
