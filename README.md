# 🔍 Price Tracker

Automatically tracks product prices every 30 minutes and sends email alerts when prices drop to your target.

## Features

- ✅ **Auto price scraping** every 30 minutes via cron job
- ✅ **Price history chart** with trend indicators
- ✅ **Email alerts** when price hits your target
- ✅ **Alert reference lines** shown on the chart
- ✅ **Manual check** button for instant refresh
- ✅ **SQLite database** with persistent disk on Render
- ✅ **Supports** Amazon, eBay, Walmart, Best Buy, Target, Newegg + generic sites
- ✅ **Custom CSS selector** support for any site

---

## Quick Start (Local)

```bash
# 1. Clone / download the project
cd price-tracker

# 2. Install all dependencies
npm run install:all

# 3. Copy env file and edit it
cp .env.example .env

# 4. Start the backend
npm run dev:server

# 5. In another terminal, start the frontend
npm run dev:client

# Frontend: http://localhost:5173
# Backend API: http://localhost:3001/api/products
```

---

## Deploy to Render (Free)

### Option A: One-click via render.yaml

1. Push this project to a **GitHub repo**
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your GitHub repo
4. Render reads `render.yaml` and sets everything up automatically
5. Add your SMTP env vars in the Render dashboard for email alerts

### Option B: Manual setup

1. Go to [render.com](https://render.com) → New → **Web Service**
2. Connect your GitHub repo
3. Set:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Node version:** 18+
4. Add a **Disk** under "Advanced":
   - Mount path: `/var/data`
   - Size: 1 GB
5. Add env vars:
   - `DATA_DIR` = `/var/data`
   - `NODE_ENV` = `production`
   - (Optional) SMTP vars for email alerts

---

## Email Alerts Setup

Without SMTP config, alert activity is logged to the console. To enable email alerts:

### Gmail (easiest)
1. Enable 2FA on your Google account
2. Go to Google Account → Security → **App Passwords**
3. Generate an app password for "Mail"
4. Set env vars:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-16-char-app-password
```

### SendGrid (recommended for production)
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your-api-key
```

---

## How Price Scraping Works

The scraper tries these strategies in order:

1. **Custom selector** — if you provide one when adding a product
2. **Domain-specific selectors** — known selectors for Amazon, eBay, Walmart, etc.
3. **Generic price selectors** — `[itemprop="price"]`, `.price`, `#price`, etc.
4. **Text scan** — finds `$xxx.xx` patterns in page text as a last resort

### Troubleshooting a product

If a product shows an error, try adding a **custom CSS selector**:
- Open the product page in Chrome
- Right-click the price → **Inspect**
- Find a unique class or ID on the price element
- Copy it (e.g., `.a-price-whole` or `#productPrice`)
- Delete and re-add the product with that selector

> **Note:** Some sites (e.g. Amazon) aggressively block scrapers. Results may vary. For heavy usage, consider using a proxy or a headless browser service.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List all products with history & alerts |
| POST | `/api/products` | Add product `{ name, url, selector? }` |
| DELETE | `/api/products/:id` | Remove product |
| POST | `/api/products/:id/check` | Trigger immediate price check |
| POST | `/api/products/:id/alerts` | Add alert `{ target_price, email }` |
| DELETE | `/api/alerts/:id` | Remove alert |
| GET | `/api/status` | App status & stats |

---

## Tech Stack

- **Backend:** Node.js, Express, node-cron, Cheerio, better-sqlite3
- **Frontend:** React, Recharts, Vite
- **Database:** SQLite (via better-sqlite3)
- **Deployment:** Render.com
