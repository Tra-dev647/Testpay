import { randomUUID } from "node:crypto";
import { sql } from "./db.js";
import { tg, esc, sendPhoto } from "./telegram.js";
import { buildKHQR, checkByMd5 } from "./bakong.js";
import { makeCard } from "./card.js";

// Prices and amounts are integer US cents (1 = $0.01)
export const PRICE = () => Math.max(1, parseInt(process.env.PRICE_USD_CENTS, 10) || 1);
export const MAX_QTY = () => Math.max(1, parseInt(process.env.MAX_QTY, 10) || 100);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const fmtMoney = (cents) => `$${(Number(cents) / 100).toFixed(2)}`;
const short = (id) => id.slice(0, 8);
const CLEAR = { inline_keyboard: [] };

export function caption(o, statusLine) {
  return (
    `🍎 <b>Apple × ${o.qty}</b>\n` +
    `សរុប / Total: <b>${fmtMoney(o.amount)}</b>\n` +
    `លេខបញ្ជាទិញ: <code>${short(o.id)}</code>\n\n` +
    statusLine
  );
}

export async function expireStale(chatId) {
  await sql`UPDATE apple_orders SET status='EXPIRED'
            WHERE chat_id=${chatId} AND status='PENDING' AND expires_at < NOW()`;
}

export async function createAndSendOrder(chatId, from, qty) {
  qty = Math.floor(Number(qty));
  if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY()) {
    await tg("sendMessage", { chat_id: chatId, text: `ចំនួនត្រូវនៅចន្លោះ 1 ដល់ ${MAX_QTY()} ផ្លែ។` });
    return null;
  }
  await expireStale(chatId);
  const pending = await sql`SELECT COUNT(*)::int AS n FROM apple_orders WHERE chat_id=${chatId} AND status='PENDING'`;
  if (pending[0].n >= 3) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "អ្នកមានការបញ្ជាទិញដែលកំពុងរង់ចាំច្រើនពេក។ សូមបង់ ឬបោះបង់ពួកវាសិន។"
    });
    return null;
  }

  const id = randomUUID();
  const amount = qty * PRICE();
  const minutes = Math.max(1, parseInt(process.env.QR_EXPIRE_MINUTES, 10) || 10);
  const expiresAt = Date.now() + minutes * 60 * 1000;

  const { qr, md5 } = buildKHQR({
    amountUsd: amount / 100,
    billNumber: id.replace(/-/g, "").slice(0, 20),
    expiresAt
  });

  await sql`INSERT INTO apple_orders (id, chat_id, username, first_name, qty, amount, md5, qr, expires_at)
            VALUES (${id}, ${chatId}, ${from?.username || null}, ${from?.first_name || null},
                    ${qty}, ${amount}, ${md5}, ${qr}, ${new Date(expiresAt).toISOString()})`;

  const order = { id, qty, amount, md5, chat_id: chatId };
  const card = await makeCard(qr);
  const kb = {
    inline_keyboard: [
      [{ text: "🔄 ពិនិត្យការទូទាត់", callback_data: `c:${id}` }],
      [{ text: "❌ បោះបង់", callback_data: `x:${id}` }]
    ]
  };
  const sent = await sendPhoto(
    chatId,
    card,
    caption(order, `ស្កេនដោយ ABA Mobile ឬកម្មវិធីណាក៏បានដែលគាំទ្រ KHQR\n⏳ ផុតកំណត់ក្នុង ${minutes} នាទី`),
    kb
  );
  const messageId = sent?.result?.message_id;
  if (messageId) await sql`UPDATE apple_orders SET message_id=${messageId} WHERE id=${id}`;
  return order;
}

async function closeCaption(o, line) {
  if (!o.message_id) return;
  await tg("editMessageCaption", {
    chat_id: o.chat_id,
    message_id: o.message_id,
    caption: caption(o, line),
    parse_mode: "HTML",
    reply_markup: CLEAR
  });
}

async function onPaid(o) {
  await closeCaption(o, "✅ <b>បានទូទាត់ហើយ</b>");
  await tg("sendMessage", {
    chat_id: o.chat_id,
    parse_mode: "HTML",
    text: `✅ <b>ទទួលបានការទូទាត់ ${fmtMoney(o.amount)}</b>\nអរគុណ! អ្នកបានទិញ 🍎 × ${o.qty}។ អ្នកលក់នឹងទាក់ទងអ្នកឆាប់ៗនេះ។`
  });
  if (process.env.ADMIN_CHAT_ID) {
    const who = [o.first_name, o.username ? "@" + o.username : null].filter(Boolean).join(" ");
    await tg("sendMessage", {
      chat_id: process.env.ADMIN_CHAT_ID,
      parse_mode: "HTML",
      text: `💰 <b>ការបញ្ជាទិញថ្មី (បានបង់)</b>\n🍎 × ${o.qty} = ${fmtMoney(o.amount)}\nអ្នកទិញ: ${esc(who) || "-"}\nChat ID: <code>${o.chat_id}</code>\nលេខ: <code>${short(o.id)}</code>`
    });
  }
}

// Checks one order against Bakong and updates DB + Telegram messages.
export async function settleAndNotify(id) {
  const rows = await sql`SELECT * FROM apple_orders WHERE id=${id}`;
  const o = rows[0];
  if (!o) return { status: "NOT_FOUND" };
  if (o.status !== "PENDING") return { status: o.status };

  const expired = new Date(o.expires_at).getTime() < Date.now();
  const r = await checkByMd5(o.md5);

  if (r.tx) {
    const okAmount = Math.abs(Number(r.tx.amount) - o.amount / 100) < 0.005;
    const okCurrency = String(r.tx.currency || "").toUpperCase() === "USD";
    if (okAmount && okCurrency) {
      const upd = await sql`UPDATE apple_orders SET status='PAID', paid_at=NOW()
                            WHERE id=${id} AND status='PENDING' RETURNING id`;
      if (upd.length) await onPaid(o); // only the first caller notifies
      return { status: "PAID" };
    }
    console.error("payment mismatch", id, r.tx);
    const upd = await sql`UPDATE apple_orders SET status='FAILED' WHERE id=${id} AND status='PENDING' RETURNING id`;
    if (upd.length) {
      await closeCaption(o, "⚠️ ការទូទាត់មិនត្រូវគ្នា សូមទាក់ទងអ្នកលក់");
      if (process.env.ADMIN_CHAT_ID) {
        await tg("sendMessage", { chat_id: process.env.ADMIN_CHAT_ID, text: `⚠️ Payment mismatch on order ${short(id)} (chat ${o.chat_id}). Check manually.` });
      }
    }
    return { status: "FAILED" };
  }

  if (expired) {
    const upd = await sql`UPDATE apple_orders SET status='EXPIRED' WHERE id=${id} AND status='PENDING' RETURNING id`;
    if (upd.length) await closeCaption(o, "⏰ QR ផុតកំណត់ សូមបញ្ជាទិញថ្មី /start");
    return { status: "EXPIRED" };
  }
  return { status: "PENDING", warning: Boolean(r.error) };
}

export async function cancelOrder(id, chatId) {
  const rows = await sql`SELECT * FROM apple_orders WHERE id=${id}`;
  const o = rows[0];
  if (!o || Number(o.chat_id) !== Number(chatId)) return "NOT_FOUND";
  if (o.status !== "PENDING") return o.status;
  // Last look at Bakong so a paid order is never cancelled by accident
  const res = await settleAndNotify(id);
  if (res.status !== "PENDING") return res.status;
  const upd = await sql`UPDATE apple_orders SET status='CANCELLED' WHERE id=${id} AND status='PENDING' RETURNING id`;
  if (upd.length) await closeCaption(o, "❌ បានបោះបង់");
  return "CANCELLED";
}
