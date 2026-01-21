// @ts-nocheck
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }
  const timestamp = Date.now();
  return res.status(200).json({
    url: `DEBUG_WORKING_${timestamp}`,
    source: "/api/stripe/create-checkout-session.ts",
  });
}
