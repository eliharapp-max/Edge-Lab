import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './Upgrade.css'

export default function Upgrade({ onUpgradeSuccess, refreshSubscription }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleUpgrade = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user?.id) {
        setError('Please log in to upgrade')
        setLoading(false)
        return
      }

      const response = await fetch(
        'https://wcqgjwotldeceldetwpf.supabase.co/functions/v1/create-checkout-session',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            user_id: userData.user.id,
          }),
        }
      )

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        throw new Error(errorPayload.error || 'Failed to start checkout')
      }

      const data = await response.json()
      if (data?.url) {
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err) {
      console.error('Upgrade error:', err)
      setError(err.message || 'Failed to start checkout. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="upgrade-container">
      <div className="upgrade-card">
        <h1 className="upgrade-title">Upgrade to Pro</h1>
        <p className="upgrade-subtitle">Unlock unlimited features and insights</p>

        <div className="pricing-section">
          <div className="price-card">
            <div className="price-amount">$6.99</div>
            <div className="price-period">per month</div>
          </div>
        </div>

        <div className="features-section">
          <div className="features-grid">
            <div className="feature-column">
              <h3 className="feature-column-title">Free</h3>
              <ul className="feature-list">
                <li>50 bets per rolling 7 days</li>
                <li>Last 14 days stats only</li>
                <li>No insights</li>
                <li>Odds converter</li>
                <li>Core app navigation</li>
              </ul>
            </div>
            <div className="feature-column pro">
              <h3 className="feature-column-title">Pro</h3>
              <ul className="feature-list">
                <li className="feature-pro">✓ Unlimited bets</li>
                <li className="feature-pro">✓ Full stats & history</li>
                <li className="feature-pro">✓ Full insights</li>
                <li className="feature-pro">✓ Odds converter</li>
                <li className="feature-pro">✓ Core app navigation</li>
              </ul>
            </div>
          </div>
        </div>

        {error && (
          <div className="upgrade-error">
            {error}
          </div>
        )}

        <button
          className="upgrade-button"
          onClick={handleUpgrade}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Upgrade to Pro'}
        </button>
      </div>
    </div>
  )
}

export function UpgradeSuccess({ onContinue }) {
  return (
    <div className="upgrade-container">
      <div className="upgrade-card">
        <div className="success-icon">🎉</div>
        <h1 className="upgrade-title">You're Pro!</h1>
        <p className="upgrade-subtitle">
          Your subscription is now active. Enjoy unlimited features and insights.
        </p>
        <button
          className="upgrade-button"
          onClick={() => {
            window.location.href = '/dashboard'
          }}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}

export function UpgradeCancel({ onBack }) {
  return (
    <div className="upgrade-container">
      <div className="upgrade-card">
        <h1 className="upgrade-title">No worries</h1>
        <p className="upgrade-subtitle">
          You can upgrade anytime to unlock Pro features.
        </p>
        <button className="upgrade-button secondary" onClick={onBack}>
          Back to App
        </button>
      </div>
    </div>
  )
}
