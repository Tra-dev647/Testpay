import { BakongKHQR, khqrData, IndividualInfo } from "bakong-khqr";

export function buildKHQR({ amountUsd, billNumber, expiresAt }) {
  const optional = {
    currency: khqrData.currency.usd,
    amount: amountUsd,
    billNumber,
    expirationTimestamp: expiresAt
  };
  if ((process.env.ACCOUNT_INFO_USD || process.env.ACCOUNT_INFO_KHR)) optional.accountInformation = process.env.ACCOUNT_INFO_USD || process.env.ACCOUNT_INFO_KHR;
  if (process.env.ACQUIRING_BANK) optional.acquiringBank = process.env.ACQUIRING_BANK;

  const info = new IndividualInfo(
    process.env.BAKONG_ACCOUNT_ID,
    (process.env.MERCHANT_NAME || "Apple Shop").slice(0, 25),
    (process.env.MERCHANT_CITY || "Phnom Penh").slice(0, 15),
    optional
  );
  const res = new BakongKHQR().generateIndividual(info);
  if (!res?.data?.qr || !res?.data?.md5) {
    throw new Error("KHQR generation failed: " + JSON.stringify(res?.status || {}));
  }
  return { qr: res.data.qr, md5: res.data.md5 };
}

// { tx } when Bakong has a matching transaction, { tx: null } when not paid yet,
// { error } when Bakong could not be reached.
export async function checkByMd5(md5) {
  const token = process.env.BAKONG_API_TOKEN;
  if (!token) return { error: "BAKONG_API_TOKEN missing" };
  const base = (process.env.BAKONG_API_URL || "https://api-bakong.nbc.gov.kh").replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/v1/check_transaction_by_md5`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ md5 })
    });
    const d = await r.json();
    if (d?.responseCode === 0 && d.data) return { tx: d.data };
    return { tx: null };
  } catch (e) {
    return { error: e.message };
  }
}
