# Supabase Authentication Setup Guide

This document provides step-by-step instructions for converting EDGE LAB to use Supabase authentication.

## Overview

The app has been converted to use Supabase Auth with:
- Email + username + 4-digit PIN authentication
- Email verification required before access
- Welcome email after verification
- Forgot PIN flow with email reset
- Lockout after 3 wrong PIN attempts
- Client-side encryption using PIN-derived keys
- Warning if old data cannot be decrypted after PIN reset

## Files Created/Modified

### New Files:
1. `src/lib/supabase.js` - Supabase client configuration
2. `src/components/Auth.jsx` - Authentication component (replaces ProfileGate)
3. `src/components/Auth.css` - Auth component styles
4. `supabase/migrations/001_initial_schema.sql` - Database schema
5. `supabase/functions/send-email/index.ts` - Edge Function for sending emails
6. `.env.example` - Environment variables template

### Modified Files:
1. `src/App.jsx` - Updated to use Supabase Auth and storage
2. `package.json` - Added @supabase/supabase-js dependency
3. `README.md` - Updated setup instructions

## Setup Steps

### 1. Supabase Project Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be fully provisioned
3. Go to SQL Editor and run `supabase/migrations/001_initial_schema.sql`
4. Go to Settings > API and copy:
   - Project URL
   - `anon` (public) key

### 2. Configure Environment Variables

1. Copy `.env.example` to `.env`
2. Add your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### 3. Resend Email Setup

1. Create account at [resend.com](https://resend.com)
2. Get your API key from the dashboard
3. (Optional) Verify your domain, or use the test domain for development

### 4. Deploy Supabase Edge Function

1. Install Supabase CLI: `npm install -g supabase`
2. Login: `supabase login`
3. Link project: `supabase link --project-ref your-project-ref`
4. Set Resend API key: `supabase secrets set RESEND_API_KEY=your_resend_api_key`
5. (Optional) Set app URL: `supabase secrets set EDGE_LAB_URL=https://your-app-url.com`
6. Deploy function: `supabase functions deploy send-email`

### 5. Install Dependencies

```bash
npm install
```

### 6. Update Email Function (Important!)

Edit `supabase/functions/send-email/index.ts` and update the `from` email address:
```typescript
from: 'EDGE LAB <noreply@yourdomain.com>', // Update with your verified domain
```

### 7. Run the App

```bash
npm run dev
```

## Authentication Flow

### Sign Up:
1. User enters email, username, and 4-digit PIN
2. Account created in Supabase Auth (password = PIN+username+email temporarily)
3. Email verification required
4. After verification, user profile created with PIN hash and salt
5. Welcome email sent

### Login:
1. User enters email and PIN
2. Authenticate with Supabase Auth
3. Verify PIN against stored hash
4. Decrypt user data using PIN-derived key
5. If PIN incorrect 3 times, account locked for 5 minutes

### PIN Reset:
1. User clicks "Forgot PIN?"
2. Reset token generated and stored
3. Email sent with reset link
4. User clicks link and sets new PIN
5. Warning shown if old data cannot be decrypted

## Database Schema

- `user_profiles`: Stores username, email, PIN hash, salt
- `user_data`: Stores encrypted bet and setup data
- `pin_reset_tokens`: Temporary tokens for PIN reset

All tables use Row Level Security (RLS) to ensure users can only access their own data.

## Security Notes

- All data encrypted client-side using AES-GCM
- Encryption keys derived from PIN + username using PBKDF2
- PIN never stored in plaintext
- Row-level security policies enforce data isolation
- Email verification required before account access

## Troubleshooting

### Email not sending:
- Check Resend API key is set correctly
- Verify domain is verified in Resend
- Check Edge Function logs: `supabase functions logs send-email`

### Login not working:
- Verify email is confirmed in Supabase Auth dashboard
- Check that user_profiles table has correct user_id
- Verify PIN hash and salt are set after email verification

### Data not decrypting:
- Ensure PIN is correct
- Check that salt is stored correctly (BYTEA format)
- Verify encryption/decryption functions are working

