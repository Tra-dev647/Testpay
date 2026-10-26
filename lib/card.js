import QRCode from "qrcode";
import { fileURLToPath } from "node:url";

// Builds a clean KHQR card: red header with white KHQR logo, QR in a rounded frame,
// soft shadow. Uses shapes only (no text) so it never depends on server fonts.
// If image tooling is unavailable, falls back to the plain QR so the bot still works.
const W = 640, H = 840;          // canvas
const CX = 30, CY = 30;          // card position
const CW = W - 60, CH = H - 60;  // card size
const HEAD = 150;                // red header height
const QR = 400;                  // QR size
const FRAME = 440;               // white frame around QR

export async function makeCard(qrText) {
  const qrPng = await QRCode.toBuffer(qrText, { margin: 2, width: QR, errorCorrectionLevel: "M" });
  try {
    const sharp = (await import("sharp")).default;

    // white version of the KHQR logo
    const logoPath = fileURLToPath(new URL("../assets/khqr-logo.png", import.meta.url));
    const logoW = 250;
    const logoRed = await sharp(logoPath).resize({ width: logoW }).png().toBuffer();
    const lm = await sharp(logoRed).metadata();
    const logo = await sharp({
      create: { width: lm.width, height: lm.height, channels: 4, background: "#ffffff" }
    })
      .composite([{ input: logoRed, blend: "dest-in" }])
      .png()
      .toBuffer();

    const frameX = Math.round((W - FRAME) / 2);
    const frameY = HEAD + CY + 40;
    const footY = frameY + FRAME + 40;

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f5f7"/><stop offset="1" stop-color="#e9ebef"/>
    </linearGradient>
    <linearGradient id="red" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e8303a"/><stop offset="1" stop-color="#c8161f"/>
    </linearGradient>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
      <feOffset dy="6"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="card"><rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="30"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="30" fill="#ffffff" filter="url(#sh)"/>
  <g clip-path="url(#card)">
    <rect x="${CX}" y="${CY}" width="${CW}" height="${HEAD}" fill="url(#red)"/>
    <path d="M ${W / 2 - 28} ${CY + HEAD} L ${W / 2} ${CY + HEAD + 22} L ${W / 2 + 28} ${CY + HEAD} Z" fill="#c8161f"/>
    <rect x="${CX}" y="${CY + CH - 22}" width="${CW}" height="22" fill="url(#red)"/>
  </g>
  <rect x="${frameX}" y="${frameY}" width="${FRAME}" height="${FRAME}" rx="24" fill="#ffffff" stroke="#e3e5ea" stroke-width="2"/>
  <line x1="${CX + 60}" y1="${footY}" x2="${CX + CW - 60}" y2="${footY}" stroke="#d9dce2" stroke-width="3" stroke-dasharray="3 10" stroke-linecap="round"/>
  <circle cx="${W / 2 - 24}" cy="${footY + 40}" r="6" fill="#e1232e"/>
  <circle cx="${W / 2}" cy="${footY + 40}" r="6" fill="#e1232e" opacity="0.6"/>
  <circle cx="${W / 2 + 24}" cy="${footY + 40}" r="6" fill="#e1232e" opacity="0.3"/>
</svg>`;

    return await sharp(Buffer.from(svg))
      .composite([
        { input: logo, top: CY + Math.round((HEAD - lm.height) / 2), left: Math.round((W - lm.width) / 2) },
        { input: qrPng, top: frameY + Math.round((FRAME - QR) / 2), left: frameX + Math.round((FRAME - QR) / 2) }
      ])
      .png()
      .toBuffer();
  } catch (e) {
    console.error("card fallback to plain QR:", e.message);
    return qrPng;
  }
}
