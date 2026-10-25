import { sql } from "../lib/db.js";
import { settleAndNotify } from "../lib/orders.js";

// Safety net: re-checks pending orders (e.g. the buyer closed Telegram before paying).
// Vercel Cron sends "Authorization: Bearer $CRON_SECRET" automatically.
// You can also call it every few minutes from a free external cron service.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "CRON_SECRET not set" });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });

  const rows = await sql`SELECT id FROM apple_orders
                         WHERE status='PENDING' AND created_at > NOW() - INTERVAL '2 hours'
                         ORDER BY created_at LIMIT 25`;
  const results = {};
  for (const r of rows) {
    const out = await settleAndNotify(r.id);
    results[out.status] = (results[out.status] || 0) + 1;
  }
  return res.status(200).json({ checked: rows.length, results });
}
