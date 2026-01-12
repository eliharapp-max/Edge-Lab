import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { generateSalt, hashPIN } from '../utils/crypto'
import './ResetPin.css'

const normalizePin = (pin) => {
  const trimmed = String(pin).trim()
  return trimmed.padStart(4, '0').slice(0, 4)
}

function ResetPin() {
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userId, setUserId] = useState(null)
  const [username, setUsername] = useState('')

  // Check for authentication on mount (Supabase redirects with tokens in URL)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Wait a moment for Supabase to process URL hash tokens
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // First try getSession (Supabase processes URL hash tokens automatically)
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session && session.user) {
          setIsAuthenticated(true)
          setUserId(session.user.id)
          
          // Load username from profile
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('user_id', session.user.id)
            .single()
          
          if (profile) {
            setUsername(profile.username)
          } else {
            // Fallback to user metadata or generate
            setUsername(session.user.user_metadata?.username || `user_${session.user.id.slice(0, 6)}`)
          }
        } else {
          // Try getUser in case tokens are in URL hash/query (Supabase processes these)
          const { data: { user }, error: userError } = await supabase.auth.getUser()
          
          if (user && !userError) {
            setIsAuthenticated(true)
            setUserId(user.id)
            
            // Load username from profile
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('username')
              .eq('user_id', user.id)
              .single()
            
            if (profile) {
              setUsername(profile.username)
            } else {
              setUsername(user.user_metadata?.username || `user_${user.id.slice(0, 6)}`)
            }
          } else {
            setIsAuthenticated(false)
          }
        }
      } catch (error) {
        console.error('Auth check error:', error)
        setIsAuthenticated(false)
      } finally {
        setChecking(false)
      }
    }
    
    checkAuth()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

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

    if (!userId || !username) {
      setError('User information not available')
      setLoading(false)
      return
    }

    try {
      // Generate new salt and hash new PIN (same way as Auth flow)
      const newSalt = generateSalt()
      const newPinHash = await hashPIN(normalizedPin, username, newSalt)

      // Update Supabase Auth password to new format
      const newPassword = `PIN:${normalizedPin}`
      const { error: passwordUpdateError } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (passwordUpdateError) {
        console.error('Password update error:', passwordUpdateError)
        // Continue anyway - profile will be updated
      }

      // Update user_profiles with new PIN hash, salt, and pin_set flag
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          pin_hash: newPinHash,
          salt: Array.from(newSalt),
          pin_set: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)

      if (updateError) {
        throw updateError
      }

      setMessage('PIN updated successfully! Redirecting to login...')

      // Sign out and redirect to login after a short delay
      setTimeout(async () => {
        await supabase.auth.signOut()
        window.location.href = '/'
      }, 2000)
    } catch (error) {
      console.error('Reset PIN error:', error)
      setError(error.message || 'Failed to update PIN. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="reset-pin-overlay">
        <div className="reset-pin-card">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>Loading...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="reset-pin-overlay">
        <div className="reset-pin-card">
          <h2>Invalid Reset Link</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            This reset link is invalid or expired. Please request a new one.
          </p>
          <div className="btn-group">
            <button
              type="button"
              className="btn"
              onClick={() => {
                window.location.href = '/'
              }}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="reset-pin-overlay">
      <div className="reset-pin-card">
        <h2>Reset PIN</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Enter your new 4-digit PIN below.
        </p>
        <form onSubmit={handleSubmit}>
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
              {loading ? 'Updating...' : 'Update PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ResetPin

