import { waitUntil } from "@vercel/functions";
import { sql } from "../lib/db.js";
import { tg } from "../lib/telegram.js";
import {
  PRICE, MAX_QTY, UUID, fmtMoney,
  createAndSendOrder, settleAndNotify, cancelOrder
} from "../lib/orders.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const menuKb = () => ({
  inline_keyboard: [
    [{ text: `🍎 ទិញ Apple (${fmtMoney(PRICE())} / ផ្លែ)`, callback_data: "q:1" }],
    [{ text: "📦 ការបញ្ជាទិញរបស់ខ្ញុំ", callback_data: "o" }]
  ]
});

function qtyView(n) {
  const max = MAX_QTY();
  n = Math.min(max, Math.max(1, n));
  const bump = (d, label) => ({ text: label, callback_data: `q:${Math.min(max, Math.max(1, n + d))}` });
  return {
    text:
      `🍎 <b>Apple</b> — ${fmtMoney(PRICE())} / ផ្លែ\n\n` +
      `ចំនួន: <b>${n}</b> ផ្លែ\nសរុប: <b>${fmtMoney(n * PRICE())}</b>`,
    reply_markup: {
      inline_keyboard: [
        [bump(-1, "➖"), { text: `${n} 🍎`, callback_data: "noop" }, bump(1, "➕")],
        [1, 5, 10, 20].map((v) => ({ text: String(v), callback_data: `q:${v}` })),
        [{ text: `✅ ទិញ ${n} ផ្លែ — ${fmtMoney(n * PRICE())}`, callback_data: `b:${n}` }],
        [{ text: "⬅️ ត្រឡប់ក្រោយ", callback_data: "m" }]
      ]
    }
  };
}

const WELCOME = () =>
  `សួស្តី! 👋 ស្វាគមន៍មកកាន់ហាងលក់ 🍎 Apple\nតម្លៃ <b>${fmtMoney(PRICE())}</b> ក្នុងមួយផ្លែ។ បង់ប្រាក់ដោយ KHQR (Bakong)។`;

async function watch(id) {
  // Poll Bakong in the background for ~50s so the buyer gets instant confirmation.
  const end = Date.now() + 50_000;
  while (Date.now() < end) {
    await sleep(4000);
    const r = await settleAndNotify(id);
    if (r.status !== "PENDING") return;
  }
}

async function listOrders(chatId) {
  const rows = await sql`SELECT id, qty, amount, status, created_at FROM apple_orders
                         WHERE chat_id=${chatId} ORDER BY created_at DESC LIMIT 5`;
  if (!rows.length) return tg("sendMessage", { chat_id: chatId, text: "អ្នកមិនទាន់មានការបញ្ជាទិញទេ។" });
  const icon = { PAID: "✅", PENDING: "⏳", EXPIRED: "⏰", CANCELLED: "❌", FAILED: "⚠️" };
  const lines = rows.map((o) => `${icon[o.status] || "•"} <code>${o.id.slice(0, 8)}</code> — 🍎 × ${o.qty} = ${fmtMoney(o.amount)} (${o.status})`);
  return tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", text: "📦 <b>ការបញ្ជាទិញចុងក្រោយ</b>\n\n" + lines.join("\n") });
}

async function onMessage(m) {
  const chatId = m.chat?.id;
  if (!chatId || m.chat.type !== "private") return;
  const text = (m.text || "").trim();
  const cmd = text.split(/[\s@]/)[0].toLowerCase();

  if (cmd === "/start" || cmd === "/menu") {
    return tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", text: WELCOME(), reply_markup: menuKb() });
  }
  if (cmd === "/orders") return listOrders(chatId);
  if (cmd === "/id") return tg("sendMessage", { chat_id: chatId, text: `Chat ID: ${chatId}` });
  return tg("sendMessage", { chat_id: chatId, text: "សូមចុច /start ដើម្បីទិញ 🍎" });
}

async function onCallback(cq) {
  const chatId = cq.message?.chat?.id;
  const msgId = cq.message?.message_id;
  const data = String(cq.data || "");
  const ack = (text, alert = false) =>
    tg("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert });
  if (!chatId) return ack();

  if (data === "noop") return ack();

  if (data === "m") {
    await ack();
    return tg("editMessageText", { chat_id: chatId, message_id: msgId, parse_mode: "HTML", text: WELCOME(), reply_markup: menuKb() });
  }
  if (data === "o") { await ack(); return listOrders(chatId); }

  if (data.startsWith("q:")) {
    await ack();
    const v = qtyView(parseInt(data.slice(2), 10) || 1);
    return tg("editMessageText", { chat_id: chatId, message_id: msgId, parse_mode: "HTML", text: v.text, reply_markup: v.reply_markup });
  }

  if (data.startsWith("b:")) {
    const qty = parseInt(data.slice(2), 10);
    await ack("កំពុងបង្កើត QR…");
    const order = await createAndSendOrder(chatId, cq.from, qty);
    if (order) await watch(order.id);
    return;
  }

  if (data.startsWith("c:") || data.startsWith("x:")) {
    const id = data.slice(2);
    if (!UUID.test(id)) return ack();
    if (data[0] === "c") {
      const r = await settleAndNotify(id);
      const msg = {
        PAID: "✅ បានទូទាត់ហើយ អរគុណ!",
        PENDING: "⏳ មិនទាន់ទទួលបានការទូទាត់ទេ។ សូមស្កេន ហើយបង់ រួចចុចម្តងទៀត។",
        EXPIRED: "⏰ QR ផុតកំណត់ សូមបញ្ជាទិញថ្មី។",
        CANCELLED: "ការបញ្ជាទិញនេះត្រូវបានបោះបង់។",
        FAILED: "⚠️ ការទូទាត់មិនត្រូវគ្នា សូមទាក់ទងអ្នកលក់។",
        NOT_FOUND: "រកមិនឃើញការបញ្ជាទិញ។"
      }[r.status] || r.status;
      return ack(msg, true);
    }
    const r = await cancelOrder(id, chatId);
    return ack(r === "CANCELLED" ? "❌ បានបោះបង់" : r === "PAID" ? "✅ បានទូទាត់ហើយ មិនអាចបោះបង់" : "មិនអាចបោះបង់", true);
  }
  return ack();
}

async function handleUpdate(u) {
  try {
    if (u.message) await onMessage(u.message);
    else if (u.callback_query) await onCallback(u.callback_query);
  } catch (e) {
    console.error("handleUpdate error:", e);
    const chatId = u.message?.chat?.id || u.callback_query?.message?.chat?.id;
    if (chatId) await tg("sendMessage", { chat_id: chatId, text: "មានបញ្ហាបន្តិចបន្តួច សូមព្យាយាមម្តងទៀត។" });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }
  // Answer Telegram immediately; keep working in the background.
  waitUntil(handleUpdate(req.body || {}));
  return res.status(200).json({ ok: true });
}
