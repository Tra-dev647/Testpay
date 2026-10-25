const url = (m) => `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${m}`;

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function tg(method, body) {
  try {
    const r = await fetch(url(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const d = await r.json().catch(() => ({}));
    if (!d.ok && !String(d.description || "").includes("not modified")) {
      console.error("telegram", method, d.description);
    }
    return d;
  } catch (e) {
    console.error("telegram fetch failed", method, e.message);
    return { ok: false };
  }
}

export async function sendPhoto(chat_id, buffer, caption, reply_markup) {
  const form = new FormData();
  form.append("chat_id", String(chat_id));
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  if (reply_markup) form.append("reply_markup", JSON.stringify(reply_markup));
  form.append("photo", new Blob([buffer], { type: "image/png" }), "khqr.png");
  try {
    const r = await fetch(url("sendPhoto"), { method: "POST", body: form });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) console.error("telegram sendPhoto", d.description);
    return d;
  } catch (e) {
    console.error("sendPhoto failed", e.message);
    return { ok: false };
  }
}
