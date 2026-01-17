// @ts-nocheck
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}

export async function POST(req: Request) {
  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!supabaseAnonKey) {
    console.error("Missing SUPABASE_ANON_KEY");
    return new Response(
      JSON.stringify({ error: "Supabase anon key not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing Stripe-Signature" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const rawBody = await req.text();
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );

    const forward = await fetch(
      "https://wcqgjwotldeceldetwpf.supabase.co/functions/v1/stripe-webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify(event),
      }
    );

    if (!forward.ok) {
      const text = await forward.text();
      console.error("Supabase forward error:", forward.status, text);
      return new Response(text || "Supabase forward failed", {
        status: forward.status,
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Webhook handler failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
