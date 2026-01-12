import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { generateSalt, deriveKey, encryptData, decryptData, hashPIN, verifyPIN } from '../utils/crypto'
import './Auth.css'

// Helper functions for normalization
const normalizeEmail = (email) => email.trim().toLowerCase()

const normalizeUsername = (username) => username.trim()

const normalizePin = (pin) => {
  const trimmed = String(pin).trim()
  return trimmed.padStart(4, '0').slice(0, 4)
}

function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState('login') // 'signup', 'login', 'forgot-pin', 'reset-pin'
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginAttempts, setLoginAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [message, setMessage] = useState('')

  // Check for reset token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      setResetToken(token)
      setMode('reset-pin')
    }
  }, [])

  // Check lockout status
  useEffect(() => {
    const lockout = localStorage.getItem('edgeLabLockout')
    if (lockout) {
      const lockoutData = JSON.parse(lockout)
      if (new Date(lockoutData.until) > new Date()) {
        setLockedUntil(new Date(lockoutData.until))
      } else {
        localStorage.removeItem('edgeLabLockout')
      }
    }
  }, [])


  // Ensure user profile exists (creates if missing)
  const ensureUserProfile = async (user) => {
    const userMetadata = user.user_metadata || {}
    const username = userMetadata.username || `user_${user.id.slice(0, 6)}`

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        email: user.email,
        username: username.toLowerCase(),
        pin_set: true
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    console.log('SUBMIT CLICKED', 'signup')
    console.log('email:', email, 'pin length:', String(pin).length)
    setError('')
    setLoading(true)

    // Normalize inputs
    const normalizedEmail = normalizeEmail(email)
    const normalizedUsername = normalizeUsername(username)
    const pinNorm = normalizePin(pin)
    const pinConfirmNorm = normalizePin(pinConfirm)

    // Validate
    if (!/^\d{4}$/.test(pinNorm)) {
      setError('PIN must be exactly 4 digits')
      setLoading(false)
      return
    }

    if (pinNorm !== pinConfirmNorm) {
      setError('PINs do not match')
      setLoading(false)
      return
    }

    try {
      // Sign up with Supabase Auth
      const password = `PIN:${pinNorm}`
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: password,
        options: {
          data: {
            username: normalizedUsername
          }
        }
      })

      console.log('AUTH RESULT', { data: authData, error: authError })

      if (authError) {
        setError(authError.message || 'Failed to create account')
        setLoading(false)
        return
      }

      setMessage('Please check your email to verify your account. After verification, you can log in.')
      setMode('login')
      setEmail('')
      setUsername('')
      setPin('')
      setPinConfirm('')
    } catch (error) {
      console.error('Signup error:', error)
      setError(error.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    console.log('SUBMIT CLICKED', 'login')
    console.log('email:', email, 'pin length:', String(pin).length)
    setError('')
    setMessage('')

    // Normalize inputs
    const normalizedEmail = normalizeEmail(email)
    const pinNorm = normalizePin(pin)

    // Validate
    if (!/^\d{4}$/.test(pinNorm)) {
      setError('PIN must be exactly 4 digits')
      return
    }

    setLoading(true)

    try {
      // Check lockout status BEFORE attempting login
      const { data: profileCheck } = await supabase
        .from('user_profiles')
        .select('locked_until, failed_pin_attempts')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (profileCheck?.locked_until) {
        const lockedUntil = new Date(profileCheck.locked_until)
        if (lockedUntil > new Date()) {
          const minutesLeft = Math.ceil((lockedUntil - new Date()) / 60000)
          setError(`Account locked. Try again in ${minutesLeft} minute(s).`)
          setLoading(false)
          return
        }
      }

      const password = `PIN:${pinNorm}`
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: password
      })

      console.log('AUTH RESULT', { data: authData, error: authError })

      if (authError) {
        // Show actual error message
        setError(authError.message || 'Failed to sign in')
        
        // Increment failed attempts on wrong password
        if (authData?.user?.id) {
          const { data: currentProfile } = await supabase
            .from('user_profiles')
            .select('failed_pin_attempts')
            .eq('user_id', authData.user.id)
            .single()

          const newAttempts = (currentProfile?.failed_pin_attempts || 0) + 1
          const updateData = { failed_pin_attempts: newAttempts }

          if (newAttempts >= 3) {
            updateData.locked_until = new Date(Date.now() + 5 * 60 * 1000).toISOString()
            updateData.failed_pin_attempts = 0 // Reset after lockout
          }

          await supabase
            .from('user_profiles')
            .update(updateData)
            .eq('user_id', authData.user.id)
        } else {
          // User not found - try to find by email to update attempts
          const { data: emailProfile } = await supabase
            .from('user_profiles')
            .select('user_id, failed_pin_attempts')
            .eq('email', normalizedEmail)
            .maybeSingle()

          if (emailProfile) {
            const newAttempts = (emailProfile.failed_pin_attempts || 0) + 1
            const updateData = { failed_pin_attempts: newAttempts }

            if (newAttempts >= 3) {
              updateData.locked_until = new Date(Date.now() + 5 * 60 * 1000).toISOString()
              updateData.failed_pin_attempts = 0
            }

            await supabase
              .from('user_profiles')
              .update(updateData)
              .eq('user_id', emailProfile.user_id)
          }
        }

        setLoading(false)
        return
      }

      // Ensure user profile exists
      const profile = await ensureUserProfile(authData.user)

      // Reset failed attempts and clear lockout on successful login
      await supabase
        .from('user_profiles')
        .update({
          failed_pin_attempts: 0,
          locked_until: null
        })
        .eq('user_id', authData.user.id)

      // Check and send welcome email if needed
      if (!profile.welcome_sent) {
        try {
          const { error: emailError } = await supabase.functions.invoke('send-email', {
            body: {
              email: normalizedEmail,
              username: profile.username,
              type: 'welcome'
            }
          })

          if (!emailError) {
            await supabase
              .from('user_profiles')
              .update({ welcome_sent: true })
              .eq('user_id', authData.user.id)
          }
        } catch (emailErr) {
          console.error('Welcome email error:', emailErr)
        }
      }

      // Call onAuthenticated with minimal data
      onAuthenticated({
        id: profile.user_id,
        email: normalizedEmail,
        username: profile.username,
        _pin: pinNorm,
        _salt: null,
        decryptedData: { bets: [], savedSetups: [] }
      })
    } catch (error) {
      console.error('Login error:', error)
      setError(error.message || 'Failed to log in')
    } finally {
      setLoading(false)
    }
  }

  // Hash token using SHA-256 (needed for reset PIN validation)
  const hashToken = async (token) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(token)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const handleForgotPin = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail) {
      setError('Email is required')
      setLoading(false)
      return
    }

    try {
      // Use Supabase Auth resetPasswordForEmail - always shows generic success
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: window.location.origin + '/reset-pin'
      })

      // Log error if any (rate limit, invalid email, etc.) but still show generic success
      if (resetError) {
        console.error('Forgot PIN error:', resetError)
      }

      // Always show generic success message regardless of outcome (no info leakage)
      setMessage('If an account exists for this email, you\'ll receive a reset link shortly.')
      setEmail('')
    } catch (error) {
      console.error('Forgot PIN error:', error)
      // Still show generic message even on error to avoid info leakage
      setMessage('If an account exists for this email, you\'ll receive a reset link shortly.')
      setEmail('')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Normalize PIN inputs
    const normalizedPin = normalizePin(pin)
    const normalizedPinConfirm = normalizePin(pinConfirm)

    if (!normalizedPin || normalizedPin.length !== 4) {
      setError('PIN must be exactly 4 digits')
      setLoading(false)
      return
    }

    if (normalizedPin !== normalizedPinConfirm) {
      setError('PINs do not match')
      setLoading(false)
      return
    }

    if (!resetToken) {
      setError('Reset token is required')
      setLoading(false)
      return
    }

    try {
      // Hash the incoming token for comparison
      const tokenHash = await hashToken(resetToken)

      // Verify reset token (compare hashed token)
      const { data: tokenData, error: tokenError } = await supabase
        .from('pin_reset_tokens')
        .select('user_id, expires_at')
        .eq('token', tokenHash) // Compare with stored hash
        .single()

      if (tokenError || !tokenData) {
        setError('Invalid or expired reset token')
        setLoading(false)
        return
      }

      if (new Date(tokenData.expires_at) < new Date()) {
        setError('Reset token has expired')
        setLoading(false)
        return
      }

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('username, salt')
        .eq('user_id', tokenData.user_id)
        .single()

      if (profileError || !profile) {
        setError('Profile not found')
        setLoading(false)
        return
      }

      // Check if user has encrypted data stored
      const { data: userData } = await supabase
        .from('user_data')
        .select('encrypted_data')
        .eq('user_id', tokenData.user_id)
        .maybeSingle()

      const hasEncryptedData = userData && userData.encrypted_data

      // Generate new salt and hash new PIN
      const newSalt = generateSalt()
      const newPinHash = await hashPIN(normalizedPin, profile.username, newSalt)

      // Update Supabase Auth password to new format
      const newPassword = `PIN:${normalizedPin}`
      const { error: passwordUpdateError } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (passwordUpdateError) {
        console.error('Password update error:', passwordUpdateError)
        // Continue anyway - profile will be updated
      }

      // Update profile with new PIN hash, salt, and pin_set flag
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          pin_hash: newPinHash,
          salt: Array.from(newSalt),
          pin_set: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', tokenData.user_id)

      if (updateError) throw updateError

      // Delete used reset token (using hashed token)
      await supabase
        .from('pin_reset_tokens')
        .delete()
        .eq('token', tokenHash)

      // Clear lockout
      localStorage.removeItem('edgeLabLockout')
      setLoginAttempts(0)

      if (hasEncryptedData) {
        setMessage('PIN reset successful! ⚠️ Warning: If your data was encrypted with your old PIN, it may not be recoverable with the new PIN.')
      } else {
        setMessage('PIN reset successful! You can now log in with your new PIN.')
      }

      setMode('login')
      setPin('')
      setPinConfirm('')
      setResetToken('')
    } catch (error) {
      console.error('Reset PIN error:', error)
      setError(error.message || 'Failed to reset PIN')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'signup') {
    return (
      <div className="auth-overlay">
        <div className="auth-blob-3"></div>
        <div className="auth-card">
          <h1 className="app-title" style={{ marginBottom: '0.5rem' }}>EDGE LAB</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            Create your secure account. All data is encrypted and stored securely.
          </p>
          <form onSubmit={handleSignup}>
            <div className="form-group">
              <label className="label">Email *</label>
              <input
                type="email"
                className="input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="label">Username *</label>
              <input
                type="text"
                className="input"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="label">4-Digit PIN *</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                className="input"
                placeholder="1234"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength="4"
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Confirm PIN *</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                className="input"
                placeholder="1234"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength="4"
                required
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}
            <div className="btn-group">
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setMode('login')
                  setError('')
                  setMessage('')
                }}
                style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
              >
                Already have an account? Login
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (mode === 'forgot-pin') {
    return (
      <div className="auth-overlay">
        <div className="auth-blob-3"></div>
        <div className="auth-card">
          <h2>Forgot PIN</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Enter your email address and we'll send you a link to reset your PIN.
          </p>
          <form onSubmit={handleForgotPin}>
            <div className="form-group">
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                required
                autoFocus
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}
            <div className="btn-group">
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Email'}
              </button>
            </div>
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setMode('login')
                  setError('')
                  setMessage('')
                }}
                style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
              >
                Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (mode === 'reset-pin') {
    return (
      <div className="auth-overlay">
        <div className="auth-blob-3"></div>
        <div className="auth-card">
          <h2>Reset PIN</h2>
          <div className="warning-message" style={{ marginBottom: '1.5rem' }}>
            <p><strong>⚠️ Warning:</strong> If your data was encrypted with your old PIN, it may not be recoverable with the new PIN.</p>
          </div>
          <form onSubmit={handleResetPin}>
            <div className="form-group">
              <label className="label">New 4-Digit PIN *</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                className="input"
                placeholder="1234"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength="4"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="label">Confirm New PIN *</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                className="input"
                placeholder="1234"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength="4"
                required
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}
            <div className="btn-group">
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Resetting...' : 'Reset PIN'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Login mode
  const isLocked = lockedUntil && new Date(lockedUntil) > new Date()
  const minutesLeft = isLocked ? Math.ceil((new Date(lockedUntil) - new Date()) / 60000) : 0

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="orb orb1" />
        <div className="orb orb2" />
        <div className="orb orb3" />
        <div className="grid-overlay" />
      </div>
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="app-title" style={{ marginBottom: '0.5rem' }}>EDGE LAB</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            Secure betting analytics. All data is encrypted and stored securely.
          </p>
          <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLocked || loading}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="label">4-Digit PIN</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              className="input"
              placeholder="1234"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength="4"
              disabled={isLocked || loading}
              required
              onKeyPress={(e) => e.key === 'Enter' && !isLocked && !loading && handleLogin(e)}
            />
          </div>
          {isLocked && (
            <div className="error-message">
              Account locked. Try again in {minutesLeft} minute(s) or reset your PIN.
            </div>
          )}
          {error && !isLocked && <div className="error-message">{error}</div>}
          {message && <div className="success-message">{message}</div>}
          {loginAttempts >= 2 && !isLocked && (
            <div className="auth-warning-message">
              ⚠️ {3 - loginAttempts} attempt(s) remaining before lockout
            </div>
          )}
          <div className="btn-group auth-button-stagger">
            <button type="submit" className="btn" disabled={isLocked || loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </div>
          <div className="auth-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setMode('forgot-pin')
                setError('')
                setMessage('')
              }}
            >
              Forgot PIN?
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setMode('signup')
                setError('')
                setMessage('')
              }}
            >
              Create Account
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}

export default Auth

