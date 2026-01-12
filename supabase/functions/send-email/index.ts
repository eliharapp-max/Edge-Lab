import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@2.0.0'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const resend = new Resend(RESEND_API_KEY)

// Create admin client with service role key (bypasses RLS)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Generate secure random token (32+ bytes, base64url)
function generateResetToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Hash token using SHA-256
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  try {
    const { email, username, type, pinResetToken } = await req.json()

    // Handle request-pin-reset type (server-side lookup)
    if (type === 'request-pin-reset') {
      if (!email) {
        return new Response(
          JSON.stringify({ error: 'Email is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const normalizedEmail = email.trim().toLowerCase()

      // Look up user by email using admin API
      const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers()
      
      let user = null
      if (!userError && users) {
        user = users.users.find(u => u.email?.toLowerCase() === normalizedEmail)
      }

      // If user exists, generate token and send email
      if (user) {
        // Generate token
        const resetToken = generateResetToken()
        const tokenHash = await hashToken(resetToken)
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

        // Get username from user_metadata or profile
        let username = user.user_metadata?.username || 'User'
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('username')
          .eq('user_id', user.id)
          .single()
        
        if (profile?.username) {
          username = profile.username
        }

        // Store hashed token in database
        const { error: insertError } = await supabaseAdmin
          .from('pin_reset_tokens')
          .insert({
            user_id: user.id,
            token: tokenHash,
            expires_at: expiresAt.toISOString()
          })

        if (!insertError) {
          // Send email
          const appUrl = Deno.env.get('EDGE_LAB_URL') || 'http://localhost:5173'
          const resetUrl = `${appUrl.replace(/\/$/, '')}/reset-pin?token=${resetToken}`

          const resetEmailResult = await resend.emails.send({
            from: 'EDGE LAB <onboarding@resend.dev>',
            to: normalizedEmail,
            subject: 'Reset Your EDGE LAB PIN',
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background: #ffffff; border: 1px solid #e1e5e9; border-radius: 12px; padding: 30px;">
                    <h1 style="color: #3182ce; margin-bottom: 20px;">Reset Your PIN</h1>
                    <p>Hi ${username},</p>
                    <p>You requested to reset your PIN for EDGE LAB. Click the button below to reset it:</p>
                    <div style="margin: 30px 0; text-align: center;">
                      <a href="${resetUrl}" style="display: inline-block; background: #3182ce; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">Reset PIN</a>
                    </div>
                    <p style="margin-top: 20px; padding: 15px; background: #fff5f5; border-radius: 8px; border-left: 4px solid #e53e3e;">
                      <strong>Important:</strong> After resetting your PIN, you may not be able to decrypt your existing data if you've forgotten your old PIN. This link will expire in 30 minutes.
                    </p>
                    <p style="margin-top: 20px; color: #718096; font-size: 14px;">
                      If you didn't request this reset, please ignore this email or contact support if you have concerns.
                    </p>
                  </div>
                </body>
              </html>
            `
          })

          console.log('Reset PIN email sent:', { to: normalizedEmail, result: resetEmailResult })
        } else {
          console.error('Failed to insert reset token:', insertError)
        }
      } else {
        console.log('User not found for email:', normalizedEmail)
      }

      // Always return 200 OK (no info leakage)
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Existing email sending logic for other types
    if (!email || !username) {
      return new Response(
        JSON.stringify({ error: 'Email and username are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let subject = ''
    let html = ''

    if (type === 'welcome') {
      const appUrl = Deno.env.get('EDGE_LAB_URL') || 'http://localhost:5173'
      subject = 'Welcome to EDGE LAB'
      html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #ffffff; border: 1px solid #e1e5e9; border-radius: 12px; padding: 30px;">
              <h1 style="color: #3182ce; margin-bottom: 20px;">Welcome to EDGE LAB</h1>
              <p>Hi ${username},</p>
              <p>Your account has been successfully verified. You can now log in to EDGE LAB using your email and 4-digit PIN.</p>
              <div style="margin: 30px 0; text-align: center;">
                <a href="${appUrl}" style="display: inline-block; background: #3182ce; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">Go to EDGE LAB</a>
              </div>
              <p style="margin-top: 20px; padding: 15px; background: #f8f9fb; border-radius: 8px; border-left: 4px solid #3182ce;">
                <strong>Remember:</strong> Your PIN is required to decrypt your data. Make sure to keep it safe and secure.
              </p>
              <p style="margin-top: 20px; color: #718096; font-size: 14px;">
                If you didn't create this account, please ignore this email.
              </p>
            </div>
          </body>
        </html>
      `
    } else if (type === 'reset_pin' || type === 'pin-reset') {
      const resetUrl = `${Deno.env.get('EDGE_LAB_URL') || 'http://localhost:5173'}/reset-pin?token=${pinResetToken}`
      subject = 'Reset Your EDGE LAB PIN'
      html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #ffffff; border: 1px solid #e1e5e9; border-radius: 12px; padding: 30px;">
              <h1 style="color: #3182ce; margin-bottom: 20px;">Reset Your PIN</h1>
              <p>Hi ${username},</p>
              <p>You requested to reset your PIN for EDGE LAB. Click the button below to reset it:</p>
              <div style="margin: 30px 0; text-align: center;">
                <a href="${resetUrl}" style="display: inline-block; background: #3182ce; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">Reset PIN</a>
              </div>
              <p style="margin-top: 20px; padding: 15px; background: #fff5f5; border-radius: 8px; border-left: 4px solid #e53e3e;">
                <strong>Important:</strong> After resetting your PIN, you may not be able to decrypt your existing data if you've forgotten your old PIN. This link will expire in 30 minutes.
              </p>
              <p style="margin-top: 20px; color: #718096; font-size: 14px;">
                If you didn't request this reset, please ignore this email or contact support if you have concerns.
              </p>
            </div>
          </body>
        </html>
      `
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid email type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const emailResult = await resend.emails.send({
      from: 'EDGE LAB <onboarding@resend.dev>',
      to: email,
      subject: subject,
      html: html,
    })

    console.log('Email sent:', { type, to: email, result: emailResult })

    if (emailResult.error) {
      console.error('Resend error:', emailResult.error)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailResult.error }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, data: emailResult }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

