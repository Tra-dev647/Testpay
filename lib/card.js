import QRCode from "qrcode";
import { fileURLToPath } from "node:url";

// Builds a simple KHQR "card": KHQR logo on top, QR below, white background.
// If image tooling is unavailable, falls back to the plain QR so the bot still works.
export async function makeCard(qrText) {
  const qrPng = await QRCode.toBuffer(qrText, { margin: 1, width: 520, errorCorrectionLevel: "M" });
  try {
    const sharp = (await import("sharp")).default;
    const logoPath = fileURLToPath(new URL("../assets/khqr-logo.png", import.meta.url));
    const logo = await sharp(logoPath).resize({ width: 320 }).png().toBuffer();
    const W = 640, H = 820;
    return await sharp({ create: { width: W, height: H, channels: 4, background: "#ffffff" } })
      .composite([
        { input: logo, top: 50, left: Math.round((W - 320) / 2) },
        { input: qrPng, top: 220, left: Math.round((W - 520) / 2) }
      ])
      .png()
      .toBuffer();
  } catch (e) {
    console.error("card fallback to plain QR:", e.message);
    return qrPng;
  }
}
