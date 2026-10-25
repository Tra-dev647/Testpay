# Apple Bot — Telegram + Bakong KHQR

Sells apples at 500៛ each. The buyer picks a quantity, the bot sends a KHQR card, and confirms
payment automatically through the Bakong Open API.

## Setup (once)
1. **Telegram**: talk to @BotFather → /newbot → copy the token (`BOT_TOKEN`).
2. **Neon**: SQL Editor → run `schema.sql` (it creates `apple_orders`).
3. **GitHub → Vercel**: push this folder, import in Vercel (Framework: Other).
4. **Environment Variables** (Vercel → Settings): everything in `.env.example`.
   - `WEBHOOK_SECRET` and `SETUP_KEY`: random letters/digits (A–Z a–z 0–9 _ -).
   - `ADMIN_CHAT_ID`: send /id to your bot, copy the number.
5. **Redeploy**, then open once in a browser:
   `https://YOUR-APP.vercel.app/api/setup-webhook?key=YOUR_SETUP_KEY`
   It should answer `{"ok":true,...}`.
6. Open your bot in Telegram → /start.

## How payment is confirmed
- After the QR is sent, the server polls Bakong ~50 s in the background (instant confirmation).
- The buyer can also tap "🔄 ពិនិត្យការទូទាត់" at any time.
- `/api/cron-check` re-checks old pending orders (set `CRON_SECRET`; Vercel Hobby runs it daily,
  or call it every few minutes from a free external cron with header `Authorization: Bearer <CRON_SECRET>`).
- An order becomes PAID only if Bakong returns a transaction for that exact QR (md5) with the right amount and currency. Each order notifies once.

## Notes
- Bakong's API may only accept Cambodian IPs. If checks fail on Vercel, tell your developer/assistant.
- Test with 1 apple (500៛) before going live. Pay from a different bank if ABA→ABA is not detected.
- After payment the bot tells the buyer you will contact them, and sends you the buyer's name/@username and order. Delivery is manual.
- Never put tokens in GitHub.
