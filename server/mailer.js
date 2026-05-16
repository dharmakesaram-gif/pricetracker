const nodemailer = require("nodemailer");

function getTransport() {
  // Use SMTP env vars; falls back to Ethereal (test) if not set
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  // No SMTP configured — log alert to console only
  return null;
}

async function sendPriceAlert({ to, productName, productUrl, targetPrice, currentPrice }) {
  const transport = getTransport();
  const subject = `🔔 Price Alert: ${productName} dropped to $${currentPrice.toFixed(2)}!`;
  const html = `
    <div style="font-family: monospace; max-width: 500px; margin: 0 auto; background: #0d0d1a; color: #f0ece0; padding: 32px; border-radius: 12px;">
      <div style="color: #e2b96f; font-size: 22px; font-weight: bold; margin-bottom: 16px;">💰 Price Alert Triggered</div>
      <p style="color: #aaa;">Your tracked product just hit your target price!</p>
      <div style="background: #1a1a2e; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <div style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;">Product</div>
        <div style="font-size: 18px; font-weight: bold; margin: 4px 0 16px;">${productName}</div>
        <div style="display: flex; gap: 24px;">
          <div>
            <div style="color: #888; font-size: 12px;">Current Price</div>
            <div style="color: #30d158; font-size: 24px; font-weight: bold;">$${currentPrice.toFixed(2)}</div>
          </div>
          <div>
            <div style="color: #888; font-size: 12px;">Your Target</div>
            <div style="color: #e2b96f; font-size: 24px; font-weight: bold;">$${targetPrice.toFixed(2)}</div>
          </div>
        </div>
      </div>
      <a href="${productUrl}" style="display: inline-block; background: #e2b96f; color: #0d0d1a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">View Product →</a>
      <p style="color: #555; font-size: 12px; margin-top: 24px;">This alert was sent by your Price Tracker app.</p>
    </div>
  `;

  if (!transport) {
    console.log(`[ALERT EMAIL - no SMTP configured]`);
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  ${productName}: $${currentPrice} (target: $${targetPrice})`);
    return { messageId: "console-log", preview: null };
  }

  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || `"Price Tracker" <alerts@pricetracker.app>`,
    to,
    subject,
    html,
  });

  console.log(`[Alert sent] ${info.messageId}`);
  return info;
}

module.exports = { sendPriceAlert };
