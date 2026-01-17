import { createClient } from '@supabase/supabase-js'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET() {
  return jsonResponse({ error: 'Method Not Allowed' }, 405)
}

export async function POST(req: Request) {
  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET')
    return jsonResponse({ error: 'Webhook secret not configured' }, 500)
  }
  if (!supabaseAnonKey) {
    console.error('Missing SUPABASE_ANON_KEY')
    return jsonResponse({ error: 'Supabase anon key not configured' }, 500)
  }

  try {
    // Get raw body for signature verification
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      return jsonResponse({ error: 'Missing stripe-signature header' }, 400)
    }

    const isValid = await verifyStripeSignature({
      payload: body,
      signatureHeader: signature,
      secret: webhookSecret,
    })

    if (!isValid) {
      return jsonResponse({ error: 'Invalid signature' }, 400)
    }

    const event = JSON.parse(body)

    // Log event type
    console.log('Stripe webhook event:', event.type)

    // Forward raw body to Supabase Edge Function
    const forwardResponse = await fetch(
      'https://wcqgjwotldeceldetwpf.supabase.co/functions/v1/stripe-webhook',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body,
      }
    )

    if (!forwardResponse.ok) {
      const errorPayload = await forwardResponse.json().catch(() => ({}))
      return jsonResponse(
        { error: errorPayload.error || 'Supabase webhook forward failed' },
        forwardResponse.status
      )
    }

    return jsonResponse({ received: true }, 200)
  } catch (error) {
    console.error('Webhook error:', error)
    return jsonResponse({ error: 'Webhook handler failed' }, 500)
  }
}

async function verifyStripeSignature({
  payload,
  signatureHeader,
  secret,
}: {
  payload: string
  signatureHeader: string
  secret: string
}) {
  const items = signatureHeader.split(',')
  const timestampPart = items.find((item) => item.startsWith('t='))
  const signatureParts = items.filter((item) => item.startsWith('v1='))

  if (!timestampPart || signatureParts.length === 0) {
    return false
  }

  const timestamp = timestampPart.split('=')[1]
  const signedPayload = `${timestamp}.${payload}`
  const expectedSignature = await computeHmacSha256Hex(secret, signedPayload)

  return signatureParts.some((part) => part.split('=')[1] === expectedSignature)
}

async function computeHmacSha256Hex(secret: string, data: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

