import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

export default async function handler(req: Request): Promise<Response> {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing Stripe signature", { status: 400 });

  const body = await req.text(); // IMPORTANT: raw body required for Stripe signature verification

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      sig,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );

    console.log("Stripe event received:", event.type);

    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err?.message ?? err);
    return new Response("Invalid signature", { status: 400 });
  }
}
