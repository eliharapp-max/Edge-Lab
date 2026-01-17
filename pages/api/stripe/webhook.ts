import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // Stripe needs RAW body to verify signatures.
  // Vercel gives raw body on req (but depending on setup, you might need to read stream).
  // We'll forward the exact body we receive to Supabase.
  const supabaseUrl = process.env.SUPABASE_FUNCTION_URL!;
  const anonKey = process.env.SUPABASE_ANON_KEY!;

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks);

  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).json({ error: "Missing Stripe-Signature" });

  const forward = await fetch(supabaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": Array.isArray(sig) ? sig[0] : sig,
      // Supabase Edge Function auth (this is why you were getting 401 before)
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: rawBody,
  });

  const text = await forward.text();
  res.status(forward.status).send(text);
}
