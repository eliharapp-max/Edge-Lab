# EDGE LAB

A secure, offline-first betting analytics tool with encrypted data storage and advanced probability calculations.

## Features

- **Arbitrage Calculator**: Detect and calculate arbitrage opportunities between two betting sides
- **Reality Check**: Advanced parlay and flex play probability calculator using Poisson binomial distribution
- **Betting Journal**: Track your bets with detailed analytics and breakdowns
- **Dashboard**: Trading-style analytics with charts and KPIs
- **Secure Authentication**: Email + PIN authentication with encrypted data storage

## Setup

### Prerequisites

- Node.js 18+ and npm
- A Supabase account (free tier works)
- A Resend account for email sending (free tier works)

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the migration file: `supabase/migrations/001_initial_schema.sql`
3. Go to Settings > API and copy your:
   - Project URL
   - `anon` (public) key

### 2. Resend Setup

1. Create an account at [resend.com](https://resend.com)
2. Create an API key in the dashboard
3. Verify your domain (or use the test domain for development)

### 3. Supabase Edge Functions

1. Install Supabase CLI: `npm install -g supabase`
2. Login: `supabase login`
3. Link your project: `supabase link --project-ref your-project-ref`
4. Set the Resend API key: `supabase secrets set RESEND_API_KEY=your_resend_api_key`
5. (Optional) Set app URL for email links: `supabase secrets set EDGE_LAB_URL=https://your-app-url.com`
6. Deploy the email function: `supabase functions deploy send-email`

**Important:** After deploying, edit `supabase/functions/send-email/index.ts` and update the `from` email address to match your verified Resend domain:
```typescript
from: 'EDGE LAB <noreply@yourdomain.com>', // Update with your verified domain
```

### 4. Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### Vercel Environment Variables

Set the following in Vercel for serverless API functions:
- `SUPABASE_ANON_KEY`

### 5. Install Dependencies

```bash
npm install
```

### 6. Run Development Server

```bash
npm run dev
```

## Database Schema

The app uses the following Supabase tables:

- `user_profiles`: Stores user profile information and PIN hash
- `user_data`: Stores encrypted bet and setup data
- `pin_reset_tokens`: Temporary tokens for PIN reset flow

## Authentication Flow

1. **Sign Up**: User provides email, username, and 4-digit PIN
2. **Email Verification**: User must verify email before logging in
3. **Welcome Email**: Sent automatically after email verification
4. **Login**: User logs in with email and PIN
5. **Data Encryption**: All data is encrypted client-side using PIN-derived key
6. **PIN Reset**: Users can request PIN reset via email

## Security

- All data is encrypted client-side using AES-GCM encryption
- Encryption keys are derived from PIN + username using PBKDF2
- PIN is hashed and never stored in plaintext
- Row-level security policies ensure users can only access their own data
- Email verification required before account access

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

The app can be deployed to any static hosting service (Vercel, Netlify, etc.):

1. Build the app: `npm run build`
2. Deploy the `dist` folder to your hosting service
3. Make sure environment variables are set in your hosting service
4. Update the `EDGE_LAB_URL` environment variable in Supabase Edge Functions to match your deployment URL

## License

MIT
