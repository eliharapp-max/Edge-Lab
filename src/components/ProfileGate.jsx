import { useState, useEffect } from 'react'
import { generateRecoveryKey, generateSalt, deriveKey, encryptData, decryptData, deriveKeyFromRecovery, hashPIN, verifyPIN } from '../utils/crypto'
import './ProfileGate.css'

function ProfileGate({ onSelectProfile, currentProfile }) {
  const [mode, setMode] = useState('login') // 'login', 'create', 'recovery', 'recovery-reset'
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [recoveryKeyConfirmed, setRecoveryKeyConfirmed] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loginAttempts, setLoginAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [error, setError] = useState('')
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('')
  const [verifiedRecoveryKey, setVerifiedRecoveryKey] = useState('') // Store verified recovery key for PIN reset

  useEffect(() => {
    // Check if account exists
    const accounts = localStorage.getItem('edgeLabAccounts')
    if (!accounts || JSON.parse(accounts).length === 0) {
      setMode('create')
    } else {
      setMode('login')
    }

    // Check lockout status
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

  const handleCreateAccount = async () => {
    setError('')
    
    if (!username.trim()) {
      setError('Username is required')
      return
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits')
      return
    }

    // Check if username already exists
    const accounts = JSON.parse(localStorage.getItem('edgeLabAccounts') || '[]')
    if (accounts.some(acc => acc.username.toLowerCase() === username.toLowerCase())) {
      setError('Username already exists')
      return
    }

    // Generate recovery key
    const key = generateRecoveryKey()
    setRecoveryKey(key)
    setRecoveryKeyConfirmed(false) // Show recovery key screen, not confirmed yet
  }

  const handleConfirmRecoveryKey = async () => {
    if (confirmText.trim().toUpperCase() !== 'I SAVED IT') {
      setError('Please type "I SAVED IT" exactly to confirm')
      return
    }

    try {
      // Generate salt
      const salt = generateSalt()
      
      // Hash PIN for verification
      const pinHash = await hashPIN(pin, username, salt)
      
      // Derive encryption key
      const encryptionKey = await deriveKey(pin, username, salt)
      
      // Create account object
      const account = {
        id: Date.now(),
        username: username.trim(),
        email: email.trim() || null,
        salt: Array.from(salt),
        pinHash: pinHash,
        recoveryKeyHash: await hashPIN(recoveryKey, username, salt), // Store recovery key hash for verification
        createdAt: new Date().toISOString()
      }

      // Initialize encrypted data storage
      const initialData = {
        bets: [],
        savedSetups: []
      }
      const encryptedData = await encryptData(initialData, encryptionKey)

      // Save account
      const accounts = JSON.parse(localStorage.getItem('edgeLabAccounts') || '[]')
      accounts.push(account)
      localStorage.setItem('edgeLabAccounts', JSON.stringify(accounts))

      // Save encrypted data
      localStorage.setItem(`edgeLab_${account.id}_encrypted`, encryptedData)

      // Clear recovery key from state (security)
      setRecoveryKey('')
      setRecoveryKeyConfirmed(false)

      // Login the user (pass PIN for encryption operations)
      await handleLogin(account.id, pin)
    } catch (error) {
      setError('Error creating account: ' + error.message)
    }
  }

  const handleLogin = async (accountId = null, providedPin = null) => {
    setError('')

    // Check lockout
    if (lockedUntil && new Date(lockedUntil) > new Date()) {
      const minutesLeft = Math.ceil((new Date(lockedUntil) - new Date()) / 60000)
      setError(`Account locked. Try again in ${minutesLeft} minute(s) or use recovery.`)
      return
    }

    const accounts = JSON.parse(localStorage.getItem('edgeLabAccounts') || '[]')
    let account

    if (accountId) {
      account = accounts.find(acc => acc.id === accountId)
    } else {
      if (!username.trim()) {
        setError('Username is required')
        return
      }
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        setError('PIN must be exactly 4 digits')
        return
      }

      account = accounts.find(acc => acc.username.toLowerCase() === username.toLowerCase())
      if (!account) {
        setError('Invalid username or PIN')
        setLoginAttempts(prev => {
          const newAttempts = prev + 1
          if (newAttempts >= 3) {
            setLockedUntil(new Date(Date.now() + 5 * 60 * 1000)) // 5 minutes
            localStorage.setItem('edgeLabLockout', JSON.stringify({
              until: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            }))
          }
          return newAttempts
        })
        return
      }

      // Verify PIN
      const salt = new Uint8Array(account.salt)
      const isValid = await verifyPIN(providedPin || pin, account.username, salt, account.pinHash)
      
      if (!isValid) {
        setError('Invalid username or PIN')
        setLoginAttempts(prev => {
          const newAttempts = prev + 1
          if (newAttempts >= 3) {
            setLockedUntil(new Date(Date.now() + 5 * 60 * 1000))
            localStorage.setItem('edgeLabLockout', JSON.stringify({
              until: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            }))
            setError('Too many failed attempts. Account locked for 5 minutes.')
          }
          return newAttempts
        })
        return
      }
    }

    // Reset login attempts on success
    setLoginAttempts(0)
    localStorage.removeItem('edgeLabLockout')
    setLockedUntil(null)

    // Decrypt user data
    try {
      const salt = new Uint8Array(account.salt)
      const encryptionKey = await deriveKey(providedPin || pin, account.username, salt)
      const encryptedData = localStorage.getItem(`edgeLab_${account.id}_encrypted`)
      const userPin = providedPin || pin
      
      if (encryptedData) {
        const decryptedData = await decryptData(encryptedData, encryptionKey)
        onSelectProfile({ ...account, encryptionKey, decryptedData, _pin: userPin })
      } else {
        // First login, no data yet
        onSelectProfile({ ...account, encryptionKey, decryptedData: { bets: [], savedSetups: [] }, _pin: userPin })
      }
    } catch (error) {
      setError('Error decrypting data: ' + error.message)
    }
  }

  const handleRecovery = async () => {
    setError('')

    if (!recoveryKeyInput.trim()) {
      setError('Recovery key is required')
      return
    }

    const accounts = JSON.parse(localStorage.getItem('edgeLabAccounts') || '[]')
    const account = accounts.find(acc => acc.username.toLowerCase() === username.toLowerCase())
    
    if (!account) {
      setError('Account not found')
      return
    }

    // Verify recovery key
    const salt = new Uint8Array(account.salt)
    const recoveryHash = await hashPIN(recoveryKeyInput.trim(), account.username, salt)
    
    if (recoveryHash !== account.recoveryKeyHash) {
      setError('Invalid recovery key')
      return
    }

    // Recovery key is valid, store it for PIN reset and allow PIN reset
    setVerifiedRecoveryKey(recoveryKeyInput.trim())
    setMode('recovery-reset')
    setRecoveryKeyInput('')
  }

  const handleRecoveryReset = async () => {
    setError('')

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits')
      return
    }

    try {
      const accounts = JSON.parse(localStorage.getItem('edgeLabAccounts') || '[]')
      const account = accounts.find(acc => acc.username.toLowerCase() === username.toLowerCase())
      
      if (!account) {
        setError('Account not found')
        return
      }

      // Decrypt existing data with recovery key
      const salt = new Uint8Array(account.salt)
      const recoveryKey = verifiedRecoveryKey
      const oldKey = await deriveKeyFromRecovery(recoveryKey, account.username, salt)
      const encryptedData = localStorage.getItem(`edgeLab_${account.id}_encrypted`)
      
      let decryptedData = { bets: [], savedSetups: [] }
      if (encryptedData) {
        try {
          decryptedData = await decryptData(encryptedData, oldKey)
        } catch (e) {
          // If decryption fails, start fresh
          decryptedData = { bets: [], savedSetups: [] }
        }
      }

      // Re-encrypt with new PIN
      const newPinHash = await hashPIN(pin, account.username, salt)
      const newKey = await deriveKey(pin, account.username, salt)
      const newEncryptedData = await encryptData(decryptedData, newKey)

      // Update account
      account.pinHash = newPinHash
      localStorage.setItem('edgeLabAccounts', JSON.stringify(accounts))
      localStorage.setItem(`edgeLab_${account.id}_encrypted`, newEncryptedData)

      // Clear lockout
      localStorage.removeItem('edgeLabLockout')
      setLockedUntil(null)
      setLoginAttempts(0)
      setVerifiedRecoveryKey('')

      // Login with new PIN
      await handleLogin(account.id, pin)
    } catch (error) {
      setError('Error resetting PIN: ' + error.message)
    }
  }

  const handleWipeData = () => {
    if (!confirm('This will permanently delete all your data. This cannot be undone. Continue?')) {
      return
    }

    const accounts = JSON.parse(localStorage.getItem('edgeLabAccounts') || '[]')
    const account = accounts.find(acc => acc.username.toLowerCase() === username.toLowerCase())
    
    if (account) {
      // Remove encrypted data
      localStorage.removeItem(`edgeLab_${account.id}_encrypted`)
      
      // Remove account
      const updatedAccounts = accounts.filter(acc => acc.id !== account.id)
      localStorage.setItem('edgeLabAccounts', JSON.stringify(updatedAccounts))
    }

    // Clear lockout
    localStorage.removeItem('edgeLabLockout')
    
    // Reset to create mode
    setMode('create')
    setUsername('')
    setPin('')
    setError('')
    setLoginAttempts(0)
    setLockedUntil(null)
  }

  if (mode === 'create') {
    if (recoveryKey && !recoveryKeyConfirmed) {
      return (
        <div className="profile-gate-overlay">
          <div className="profile-gate-card">
            <h2>Save Your Recovery Key</h2>
            <div className="recovery-key-warning">
              <p style={{ color: 'var(--accent-red)', fontWeight: 600, marginBottom: '1rem' }}>
                ⚠️ CRITICAL: Save this recovery key now. Without it, you cannot recover your data if you forget your PIN.
              </p>
              <div className="recovery-key-display">
                <code>{recoveryKey}</code>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '1rem' }}>
                Write it down or save it in a secure password manager. You will not see this again.
              </p>
            </div>
            <div className="form-group" style={{ marginTop: '2rem' }}>
              <label className="label">Type "I SAVED IT" to continue</label>
              <input
                type="text"
                className="input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="I SAVED IT"
                autoFocus
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <div className="btn-group" style={{ marginTop: '1.5rem' }}>
              <button className="btn" onClick={handleConfirmRecoveryKey}>
                I Saved It - Continue
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="profile-gate-overlay">
        <div className="profile-gate-card">
          <h1 className="app-title" style={{ marginBottom: '0.5rem' }}>EDGE LAB</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            Create your secure account. All data is encrypted and stored locally on your device.
          </p>
          <div className="create-profile-form">
            <div className="form-group">
              <label className="label">Username *</label>
              <input
                type="text"
                className="input"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="label">Email (Optional - for display only)</label>
              <input
                type="email"
                className="input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">4-Digit PIN *</label>
              <input
                type="password"
                className="input"
                placeholder="1234"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength="4"
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                You'll receive a recovery key after creating your account.
              </p>
            </div>
            {error && <div className="error-message">{error}</div>}
            <div className="btn-group">
              <button className="btn" onClick={handleCreateAccount}>
                Create Account
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'recovery' || mode === 'recovery-reset') {
    if (mode === 'recovery-reset') {
      return (
        <div className="profile-gate-overlay">
          <div className="profile-gate-card">
            <h2>Reset PIN</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Recovery key verified. Enter your new 4-digit PIN.
            </p>
            <div className="form-group">
              <label className="label">New 4-Digit PIN *</label>
              <input
                type="password"
                className="input"
                placeholder="1234"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength="4"
                autoFocus
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <div className="btn-group" style={{ marginTop: '1.5rem' }}>
              <button className="btn" onClick={handleRecoveryReset}>
                Reset PIN
              </button>
              <button className="btn btn-secondary" onClick={() => {
                setMode('recovery')
                setPin('')
                setError('')
                setVerifiedRecoveryKey('')
              }}>
                Back
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="profile-gate-overlay">
        <div className="profile-gate-card">
          <h2>Recover Account</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Enter your username and recovery key to reset your PIN.
          </p>
          <div className="form-group">
            <label className="label">Username</label>
            <input
              type="text"
              className="input"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="label">Recovery Key</label>
            <input
              type="text"
              className="input"
              placeholder="xxxx-xxxx-xxxx-xxxx"
              value={recoveryKeyInput}
              onChange={(e) => setRecoveryKeyInput(e.target.value)}
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <div className="btn-group" style={{ marginTop: '1.5rem' }}>
            <button className="btn" onClick={handleRecovery}>
              Verify & Reset PIN
            </button>
            <button className="btn btn-secondary" onClick={() => {
              setMode('login')
              setUsername('')
              setRecoveryKeyInput('')
              setError('')
            }}>
              Back to Login
            </button>
          </div>
          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Lost your recovery key?
            </p>
            <button className="btn btn-secondary" onClick={handleWipeData}>
              Wipe Local Data
            </button>
            <p style={{ color: 'var(--accent-red)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
              This will permanently delete all your data.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Login mode
  const isLocked = lockedUntil && new Date(lockedUntil) > new Date()
  const minutesLeft = isLocked ? Math.ceil((new Date(lockedUntil) - new Date()) / 60000) : 0

  return (
    <div className="profile-gate-overlay">
      <div className="profile-gate-card">
        <h1 className="app-title" style={{ marginBottom: '0.5rem' }}>EDGE LAB</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Secure local account. All data is encrypted and stored on your device only.
        </p>
        <div className="login-form">
          <div className="form-group">
            <label className="label">Username</label>
            <input
              type="text"
              className="input"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLocked}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="label">4-Digit PIN</label>
            <input
              type="password"
              className="input"
              placeholder="1234"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength="4"
              disabled={isLocked}
              onKeyPress={(e) => e.key === 'Enter' && !isLocked && handleLogin()}
            />
          </div>
          {isLocked && (
            <div className="error-message">
              Account locked. Try again in {minutesLeft} minute(s) or use recovery.
            </div>
          )}
          {error && !isLocked && <div className="error-message">{error}</div>}
          {loginAttempts >= 2 && !isLocked && (
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-yellow)', marginTop: '0.5rem' }}>
              ⚠️ {3 - loginAttempts} attempt(s) remaining before lockout
            </div>
          )}
          <div className="btn-group" style={{ marginTop: '1.5rem' }}>
            <button className="btn" onClick={() => handleLogin()} disabled={isLocked}>
              Login
            </button>
          </div>
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setMode('recovery')
                setError('')
              }}
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            >
              Forgot PIN?
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfileGate
