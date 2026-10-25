import { tg } from "../lib/telegram.js";

// Open once in the browser after deploying:
//   https://YOUR-APP.vercel.app/api/setup-webhook?key=SETUP_KEY
export default async function handler(req, res) {
  const key = process.env.SETUP_KEY;
  if (!key || req.query?.key !== key) return res.status(401).json({ error: "unauthorized" });
  if (!process.env.BOT_TOKEN || !process.env.WEBHOOK_SECRET) {
    return res.status(503).json({ error: "BOT_TOKEN / WEBHOOK_SECRET missing" });
  }
  const url = `https://${req.headers.host}/api/telegram`;
  const r = await tg("setWebhook", {
    url,
    secret_token: process.env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true
  });
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "ចាប់ផ្តើម / Start" },
      { command: "orders", description: "ការបញ្ជាទិញរបស់ខ្ញុំ" },
      { command: "id", description: "Chat ID" }
    ]
  });
  return res.status(200).json({ ok: r.ok, description: r.description || "webhook set", url });
}
