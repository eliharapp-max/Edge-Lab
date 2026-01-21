export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}

export async function POST(req: Request) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_ANON_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const rawBody = await req.text();
    const forward = await fetch(
      "https://wcqgjwotldeceldetwpf.supabase.co/functions/v1/create-checkout-session",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: rawBody,
      }
    );

    const text = await forward.text();
    return new Response(text, {
      status: forward.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to forward checkout request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
