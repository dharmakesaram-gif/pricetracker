const fetch = require("node-fetch");
const cheerio = require("cheerio");

// Common price selectors by domain
const DOMAIN_SELECTORS = {
  "amazon.com": [
    ".a-price-whole",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    ".a-price .a-offscreen",
    "#apex_offerDisplay_desktop .a-price .a-offscreen",
  ],
  "ebay.com": [
    ".x-price-primary .ux-textspans",
    "#prcIsum",
    ".notranslate",
  ],
  "walmart.com": [
    '[itemprop="price"]',
    ".price-characteristic",
    ".inline-flex .f2",
  ],
  "bestbuy.com": [
    ".priceView-hero-price .priceView-customer-price span",
    '[data-testid="customer-price"] span',
  ],
  "target.com": [
    '[data-test="product-price"]',
    ".h-text-orangeLight",
  ],
  "newegg.com": [
    ".price-current strong",
    ".product-price .price-current",
  ],
};

const GENERIC_SELECTORS = [
  '[itemprop="price"]',
  ".price",
  "#price",
  ".product-price",
  ".sale-price",
  '[class*="price"]',
  '[id*="price"]',
];

function extractPrice(text) {
  if (!text) return null;
  // Remove currency symbols, spaces, commas; handle ranges by taking first
  const cleaned = text.replace(/[^\d.,]/g, "").split(/[-–]/)[0].trim();
  // Handle European format (1.234,56) vs US (1,234.56)
  let normalized = cleaned;
  if (/\d+\.\d{3}/.test(cleaned) && !cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const num = parseFloat(normalized);
  return isNaN(num) || num <= 0 || num > 1000000 ? null : num;
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

async function fetchWithHeaders(url) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
  };
  const res = await fetch(url, { headers, timeout: 15000, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function scrapePrice(url, customSelector = null) {
  const domain = getDomain(url);
  let html;

  try {
    html = await fetchWithHeaders(url);
  } catch (err) {
    throw new Error(`Failed to fetch page: ${err.message}`);
  }

  const $ = cheerio.load(html);

  // Try custom selector first
  if (customSelector) {
    const el = $(customSelector).first();
    if (el.length) {
      const price = extractPrice(el.attr("content") || el.text());
      if (price) return { price, method: "custom" };
    }
  }

  // Try domain-specific selectors
  const domainSelectors = DOMAIN_SELECTORS[domain] || [];
  for (const sel of domainSelectors) {
    const el = $(sel).first();
    if (el.length) {
      const price = extractPrice(el.attr("content") || el.text());
      if (price) return { price, method: "domain" };
    }
  }

  // Try generic selectors
  for (const sel of GENERIC_SELECTORS) {
    const el = $(sel).first();
    if (el.length) {
      const val = el.attr("content") || el.attr("data-price") || el.text();
      const price = extractPrice(val);
      if (price) return { price, method: "generic" };
    }
  }

  // Last resort: find largest price-like number in visible text
  const bodyText = $("body").text();
  const priceMatches = bodyText.match(/\$[\d,]+\.?\d{0,2}/g);
  if (priceMatches && priceMatches.length > 0) {
    const prices = priceMatches.map((m) => extractPrice(m)).filter(Boolean);
    if (prices.length > 0) {
      // Pick median-ish price to avoid outliers
      prices.sort((a, b) => a - b);
      const candidate = prices[Math.floor(prices.length / 2)];
      if (candidate) return { price: candidate, method: "text-scan" };
    }
  }

  throw new Error("Could not find price on page. Try adding a custom CSS selector.");
}

module.exports = { scrapePrice };
