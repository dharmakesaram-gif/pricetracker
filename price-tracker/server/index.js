require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");
const db = require("./db");
const { scrapePrice } = require("./scraper");
const { sendPriceAlert } = require("./mailer");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Serve React build in production ───────────────────────────────────────
const clientBuild = path.join(__dirname, "../client/dist");
app.use(express.static(clientBuild));

// ─── Price check core logic ─────────────────────────────────────────────────
async function checkProduct(product) {
  console.log(`[Checking] ${product.name} — ${product.url}`);
  try {
    const { price } = await scrapePrice(product.url, product.selector);

    // Update product
    db.prepare(`
      UPDATE products SET current_price = ?, last_checked = datetime('now'), last_error = NULL WHERE id = ?
    `).run(price, product.id);

    // Insert history only if price changed or no history yet
    const last = db.prepare(
      `SELECT price FROM price_history WHERE product_id = ? ORDER BY checked_at DESC LIMIT 1`
    ).get(product.id);

    if (!last || last.price !== price) {
      db.prepare(`INSERT INTO price_history (product_id, price) VALUES (?, ?)`).run(product.id, price);
    }

    // Check alerts
    const alerts = db.prepare(`
      SELECT * FROM alerts WHERE product_id = ? AND triggered = 0 AND target_price >= ?
    `).all(product.id, price);

    for (const alert of alerts) {
      console.log(`[Alert] Triggering alert for ${product.name} — $${price} <= $${alert.target_price}`);
      try {
        await sendPriceAlert({
          to: alert.email,
          productName: product.name,
          productUrl: product.url,
          targetPrice: alert.target_price,
          currentPrice: price,
        });
        db.prepare(`
          UPDATE alerts SET triggered = 1, triggered_at = datetime('now') WHERE id = ?
        `).run(alert.id);
      } catch (e) {
        console.error(`[Alert error] ${e.message}`);
      }
    }

    return { success: true, price };
  } catch (err) {
    console.error(`[Error] ${product.name}: ${err.message}`);
    db.prepare(`
      UPDATE products SET last_checked = datetime('now'), last_error = ? WHERE id = ?
    `).run(err.message, product.id);
    return { success: false, error: err.message };
  }
}

async function checkAllProducts() {
  const products = db.prepare(`SELECT * FROM products WHERE active = 1`).all();
  console.log(`[Cron] Checking ${products.length} products...`);
  for (const p of products) {
    await checkProduct(p);
    await new Promise((r) => setTimeout(r, 2000)); // 2s delay between requests
  }
  console.log(`[Cron] Done.`);
}

// ─── Cron: every 30 minutes ─────────────────────────────────────────────────
cron.schedule("*/30 * * * *", checkAllProducts);
console.log("[Cron] Price check scheduled every 30 minutes.");

// ─── API Routes ─────────────────────────────────────────────────────────────

// GET /api/products
app.get("/api/products", (req, res) => {
  const products = db.prepare(`SELECT * FROM products ORDER BY created_at DESC`).all();
  const result = products.map((p) => {
    const history = db.prepare(
      `SELECT price, checked_at FROM price_history WHERE product_id = ? ORDER BY checked_at ASC`
    ).all(p.id);
    const alerts = db.prepare(
      `SELECT * FROM alerts WHERE product_id = ? ORDER BY created_at DESC`
    ).all(p.id);
    return { ...p, history, alerts };
  });
  res.json(result);
});

// POST /api/products
app.post("/api/products", async (req, res) => {
  const { name, url, selector } = req.body;
  if (!name || !url) return res.status(400).json({ error: "name and url are required" });

  try {
    new URL(url); // validate URL
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  // Check for duplicate
  const existing = db.prepare(`SELECT id FROM products WHERE url = ?`).get(url);
  if (existing) return res.status(409).json({ error: "This URL is already being tracked" });

  // Try scraping immediately
  let initialPrice = null;
  let scrapeError = null;
  try {
    const result = await scrapePrice(url, selector);
    initialPrice = result.price;
  } catch (e) {
    scrapeError = e.message;
  }

  const info = db.prepare(`
    INSERT INTO products (name, url, selector, current_price, last_checked, last_error)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
  `).run(name, url, selector || null, initialPrice, scrapeError);

  if (initialPrice !== null) {
    db.prepare(`INSERT INTO price_history (product_id, price) VALUES (?, ?)`).run(info.lastInsertRowid, initialPrice);
  }

  const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(info.lastInsertRowid);
  const history = db.prepare(`SELECT price, checked_at FROM price_history WHERE product_id = ?`).all(info.lastInsertRowid);

  res.status(201).json({ ...product, history, alerts: [] });
});

// DELETE /api/products/:id
app.delete("/api/products/:id", (req, res) => {
  db.prepare(`DELETE FROM products WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// POST /api/products/:id/check — manual re-check
app.post("/api/products/:id/check", async (req, res) => {
  const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(req.params.id);
  if (!product) return res.status(404).json({ error: "Not found" });
  const result = await checkProduct(product);
  const updated = db.prepare(`SELECT * FROM products WHERE id = ?`).get(req.params.id);
  const history = db.prepare(`SELECT price, checked_at FROM price_history WHERE product_id = ? ORDER BY checked_at ASC`).all(req.params.id);
  const alerts = db.prepare(`SELECT * FROM alerts WHERE product_id = ?`).all(req.params.id);
  res.json({ ...updated, history, alerts, scrape: result });
});

// POST /api/products/:id/alerts
app.post("/api/products/:id/alerts", (req, res) => {
  const { target_price, email } = req.body;
  if (!target_price || !email) return res.status(400).json({ error: "target_price and email required" });
  const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const info = db.prepare(`
    INSERT INTO alerts (product_id, target_price, email) VALUES (?, ?, ?)
  `).run(req.params.id, parseFloat(target_price), email);

  res.status(201).json(db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(info.lastInsertRowid));
});

// DELETE /api/alerts/:id
app.delete("/api/alerts/:id", (req, res) => {
  db.prepare(`DELETE FROM alerts WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// GET /api/status
app.get("/api/status", (req, res) => {
  const productCount = db.prepare(`SELECT COUNT(*) as c FROM products WHERE active = 1`).get().c;
  const alertCount = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE triggered = 0`).get().c;
  const lastCheck = db.prepare(`SELECT MAX(last_checked) as t FROM products`).get().t;
  res.json({ productCount, alertCount, lastCheck, uptime: process.uptime() });
});

// Fallback: serve React app
app.get("*", (req, res) => {
  res.sendFile(path.join(clientBuild, "index.html"), (err) => {
    if (err) res.status(200).send("Price Tracker API running. Build the client to serve UI.");
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Price Tracker running on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/products`);
  console.log(`   Cron: every 30 minutes\n`);
});
