# EDGE LAB Upgrade Implementation Guide

## ✅ Completed

1. **Database Migration** - Added `welcome_sent`, `failed_pin_attempts`, `locked_until` columns
2. **Lockout Mechanism** - Added to login flow (3 attempts = 5 min lockout)
3. **Email Delivery Fixes** - Updated Edge Function with proper Resend config and logging
4. **Welcome Email** - Integrated into login flow
5. **Landing Page** - Created with modern design

## 🔄 In Progress / Next Steps

### Critical: Install Dependencies
```bash
npm install react-router-dom
```

### Routing Structure (To Implement)

Update `src/main.jsx` to use React Router:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './components/Landing'
import Auth from './components/Auth'
import App from './App'

// Routes:
// / -> Landing
// /login -> Auth (mode='login')
// /signup -> Auth (mode='signup')
// /forgot-pin -> Auth (mode='forgot-pin')
// /reset-pin -> Auth (mode='reset-pin', token from query)
// /dashboard -> App (redirect after login)
```

### Required Updates

1. **App.jsx Routing**
   - Remove direct Auth rendering
   - Use `<Outlet />` or conditional routing
   - Redirect `/` to `/dashboard` if authenticated
   - Redirect to `/login` if not authenticated

2. **Auth.jsx Route Integration**
   - Accept `mode` prop or read from URL params
   - Handle `/reset-pin?token=...` route

3. **Journal Updates**
   - Change "Stake (Units)" → "Stake ($)" everywhere
   - Add "Book/App Used" dropdown field
   - Update profit calculations to use dollars

4. **Arb Checker Improvements**
   - Show results section with:
     - Implied probabilities
     - Overround/vig
     - Arb exists badge
     - Recommended stake splits
     - Expected profit

5. **Reality Check Improvements**
   - Support 0-100% per leg
   - Show flex probabilities table (k of n)
   - Different probability per leg

6. **UI Theme Update**
   - Brighter colors
   - Modern gradients
   - Better spacing
   - Smooth animations

7. **Client-Side Encryption**
   - Verify encryption is working
   - Add "Security: Encryption ON" indicator
   - Show last saved timestamp

## Required Secrets Checklist

Set these in Supabase Edge Functions:

- ✅ `RESEND_API_KEY` - Your Resend API key
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for admin API)
- ✅ `EDGE_LAB_URL` - Your app URL (e.g., `https://your-app.com`)
- ✅ `SUPABASE_URL` - Your Supabase project URL

## Database Migration

Run the new migration:
```bash
supabase migration up
# Or via Supabase Dashboard: SQL Editor > Run migration 002_add_lockout_and_welcome.sql
```

## Edge Function Deployment

```bash
supabase functions deploy send-email
```

## Testing Checklist

- [ ] Login with correct PIN works
- [ ] Login with wrong PIN increments attempts
- [ ] 3 wrong attempts = 5 min lockout
- [ ] Lockout shows time remaining
- [ ] Forgot PIN sends email (no info leakage)
- [ ] Reset PIN link works
- [ ] Welcome email sends on first login
- [ ] Landing page displays correctly
- [ ] Routing works (/, /login, /signup, /dashboard)
- [ ] Journal uses dollars
- [ ] Arb checker shows results
- [ ] Reality check supports 0-100% per leg

