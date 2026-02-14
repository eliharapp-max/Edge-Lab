/* @ts-nocheck */
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!secretKey || !priceId) {
    console.error("Missing env vars", { hasKey: !!secretKey, hasPrice: !!priceId });
    return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID" });
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const host = req.headers["host"];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const baseUrl = (siteUrl ? siteUrl : `${protocol || "https"}://${host}`).replace(/\/+$/, "");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard?checkout=cancel`,
    });

    if (!session?.url) {
      console.error("Stripe returned no session.url", { sessionId: session?.id });
      return res.status(500).json({ error: "Stripe returned no session.url" });
    }

    // ✅ REQUIRED response shape
    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error("Stripe checkout create error", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
