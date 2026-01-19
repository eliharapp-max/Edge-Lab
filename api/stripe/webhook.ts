import crypto from "crypto";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).end("Method Not Allowed");
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!webhookSecret) {
    return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET is not configured" });
  }
  if (!anonKey) {
    return res.status(500).json({ error: "SUPABASE_ANON_KEY is not configured" });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks);

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ error: "Missing Stripe-Signature" });
  }

  const signatureHeader = Array.isArray(signature) ? signature[0] : signature;
  const isValid = verifyStripeSignature(rawBody.toString("utf8"), signatureHeader, webhookSecret);
  if (!isValid) {
    return res.status(400).json({ error: "Invalid Stripe-Signature" });
  }

  const forward = await fetch(
    "https://wcqgjwotldeceldetwpf.supabase.co/functions/v1/stripe-webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        "stripe-signature": signatureHeader,
      },
      body: rawBody,
    }
  );

  const text = await forward.text();
  if (!forward.ok) {
    return res.status(forward.status).send(text);
  }

  return res.status(200).send(text || "OK");
}

function verifyStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const items = signatureHeader.split(",");
  const timestampPart = items.find((item) => item.startsWith("t="));
  const signatureParts = items.filter((item) => item.startsWith("v1="));

  if (!timestampPart || signatureParts.length === 0) {
    return false;
  }

  const timestamp = timestampPart.split("=")[1];
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  return signatureParts.some((part) => {
    const sig = part.split("=")[1];
    if (!sig || sig.length !== expected.length) return false;
    return timingSafeEqualHex(sig, expected);
  });
}

function timingSafeEqualHex(a: string, b: string) {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
