import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  try {
    const body = await req.text()
    const event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)

    // Handle different event types
    let userId: string | null = null
    let subscriptionStatus: string = 'canceled'
    let subscriptionId: string | null = null
    let customerId: string | null = null
    let currentPeriodEnd: number | null = null

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      userId = session.metadata?.supabase_user_id || null
      subscriptionId = session.subscription as string | null
      customerId = session.customer as string | null
      
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        subscriptionStatus = subscription.status
        currentPeriodEnd = subscription.current_period_end
        userId = userId || subscription.metadata?.supabase_user_id || null
      }
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated'
    ) {
      const subscription = event.data.object as Stripe.Subscription
      subscriptionId = subscription.id
      customerId = subscription.customer as string | null
      subscriptionStatus = subscription.status
      currentPeriodEnd = subscription.current_period_end
      userId = subscription.metadata?.supabase_user_id || null

      // Get user_id from customer metadata
      if (!userId && customerId) {
        const customer = await stripe.customers.retrieve(customerId)
        if (typeof customer === 'object' && !customer.deleted) {
          userId = customer.metadata?.supabase_user_id || null
        }
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      subscriptionId = subscription.id
      customerId = subscription.customer as string | null
      subscriptionStatus = 'canceled'
      userId = subscription.metadata?.supabase_user_id || null

      // Get user_id from customer metadata
      if (!userId && customerId) {
        const customer = await stripe.customers.retrieve(customerId)
        if (typeof customer === 'object' && !customer.deleted) {
          userId = customer.metadata?.supabase_user_id || null
        }
      }
    } else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice
      customerId = invoice.customer as string | null
      subscriptionId = invoice.subscription as string | null

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        subscriptionStatus = subscription.status
        currentPeriodEnd = subscription.current_period_end
        userId = subscription.metadata?.supabase_user_id || null
      }

      if (!userId && customerId) {
        const customer = await stripe.customers.retrieve(customerId)
        if (typeof customer === 'object' && !customer.deleted) {
          userId = customer.metadata?.supabase_user_id || null
        }
      }
    }

    if (!userId) {
      console.error('Could not find user_id for event:', event.type)
      return new Response(JSON.stringify({ received: true, error: 'No user_id found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Determine if user should be PRO
    const isPro = subscriptionStatus === 'active' || subscriptionStatus === 'trialing'

    // Update subscription record
    await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status: subscriptionStatus,
        current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      }, {
        onConflict: 'user_id'
      })

    // Update user_profiles.is_pro
    await supabaseAdmin
      .from('user_profiles')
      .update({ is_pro: isPro })
      .eq('user_id', userId)

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Webhook handler failed' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
})
