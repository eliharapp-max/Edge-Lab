import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { corsHeaders } from '../_shared/cors.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''
const STRIPE_PRICE_ID = Deno.env.get('STRIPE_PRICE_ID') || ''
const NEXT_PUBLIC_SITE_URL = Deno.env.get('NEXT_PUBLIC_SITE_URL') || ''
const NEXT_PUBLIC_VERCEL_URL = Deno.env.get('NEXT_PUBLIC_VERCEL_URL') || ''
const VERCEL_URL = Deno.env.get('VERCEL_URL') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

function getBaseUrl() {
  if (NEXT_PUBLIC_SITE_URL) {
    return NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
  }
  if (VERCEL_URL) {
    return `https://${VERCEL_URL}`.replace(/\/+$/, '')
  }
  if (NEXT_PUBLIC_VERCEL_URL) {
    return `https://${NEXT_PUBLIC_VERCEL_URL}`.replace(/\/+$/, '')
  }
  const isLocal =
    Deno.env.get('SUPABASE_ENV') === 'local' ||
    Deno.env.get('NODE_ENV') === 'development'
  if (isLocal) {
    return 'http://localhost:3000'
  }
  throw new Error('Missing production site URL env var')
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  try {
    const payload = await req.json().catch(() => ({}))
    const providedUserId = payload?.user_id || null
    const authHeader = req.headers.get('Authorization')

    let userId = providedUserId
    let userEmail: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      if (user?.id) {
        userId = user.id
        userEmail = user.email || null
      }
    }

    if (userId && !userEmail) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
      userEmail = userData?.user?.email || null
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing user_id or valid auth token' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      )
    }

    // Create checkout session
    const baseUrl = getBaseUrl()
    const successUrl = `${baseUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/dashboard?checkout=cancel`
    console.log('CHECKOUT_URLS', { baseUrl, successUrl, cancelUrl })
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: userId,
      customer_email: userEmail || undefined,
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: userId,
      },
      subscription_data: {
        metadata: {
          user_id: userId,
        },
      },
    })

    return new Response(
      JSON.stringify({ url: session.url, baseUrl, success_url: successUrl, cancel_url: cancelUrl }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    )
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    )
  }
})
