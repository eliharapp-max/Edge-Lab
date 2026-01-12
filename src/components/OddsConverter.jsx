import { useState } from 'react'
import './OddsConverter.css'

function OddsConverter() {
  const [moneyline, setMoneyline] = useState('')
  const [impliedPercent, setImpliedPercent] = useState('')
  const [moneylineA, setMoneylineA] = useState('')
  const [moneylineB, setMoneylineB] = useState('')
  const [includeVigRemoval, setIncludeVigRemoval] = useState(false)

  // Convert moneyline to implied probability
  const moneylineToPercent = (ml) => {
    if (!ml || ml.trim() === '') return null
    
    // Remove + sign if present, parse as number
    const cleaned = ml.toString().replace(/\+/g, '')
    const num = parseFloat(cleaned)
    if (isNaN(num)) return null
    
    // Treat positive numbers without + as positive (e.g., 110 = +110)
    const odds = num
    
    let p
    if (odds < 0) {
      p = Math.abs(odds) / (Math.abs(odds) + 100)
    } else {
      p = 100 / (odds + 100)
    }
    
    return p * 100
  }

  // Convert probability to moneyline
  const percentToMoneyline = (percent) => {
    let p = parseFloat(percent)
    if (isNaN(p)) return null
    
    // If input is 0-1 range, convert to 0-100
    if (p > 0 && p <= 1) {
      p = p * 100
    }
    
    // Clamp to valid range
    if (p <= 0 || p >= 100) return null
    
    p = p / 100 // Convert to 0-1 range
    
    let ml
    if (p > 0.5) {
      ml = -(p / (1 - p)) * 100
    } else if (p < 0.5) {
      ml = ((1 - p) / p) * 100
    } else {
      ml = 100
    }
    
    return Math.round(ml)
  }

  // Calculate fair probability (vig removal) for 2-way market
  const calculateFairPercent = (mlA, mlB) => {
    const pA = moneylineToPercent(mlA)
    const pB = moneylineToPercent(mlB)
    
    if (!pA || !pB) return null
    
    const total = pA + pB
    if (total <= 0) return null
    
    // Fair probability removes the vig
    const fairA = (pA / total) * 100
    return fairA
  }

  const handleMoneylineChange = (value) => {
    setMoneyline(value)
    const percent = moneylineToPercent(value)
    if (percent !== null) {
      setImpliedPercent(percent.toFixed(2))
    } else {
      setImpliedPercent('')
    }
  }

  const handlePercentChange = (value) => {
    setImpliedPercent(value)
    const ml = percentToMoneyline(value)
    if (ml !== null) {
      setMoneyline(ml >= 0 ? `+${ml}` : ml.toString())
    } else {
      setMoneyline('')
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could show a toast here, but keeping minimal
    }).catch(err => {
      console.error('Failed to copy:', err)
    })
  }

  const impliedPercentResult = moneyline ? moneylineToPercent(moneyline) : null
  const moneylineResult = impliedPercent ? percentToMoneyline(impliedPercent) : null
  const fairPercentA = includeVigRemoval && moneylineA && moneylineB 
    ? calculateFairPercent(moneylineA, moneylineB) 
    : null
  const fairPercentB = fairPercentA !== null ? (100 - fairPercentA) : null

  return (
    <div className="odds-converter">
      <div className="card">
        <div className="card-section">
          <h2 className="section-title">Odds ⇄ % Converter</h2>
          
          <div className="converter-single-column">
            {/* Moneyline → Implied % */}
            <div className="converter-panel">
              <h3 className="panel-title">Moneyline → Implied %</h3>
              <div className="form-group">
                <label className="label">Moneyline</label>
                <input
                  type="text"
                  className="input oddsInput"
                  placeholder="-110 or +150 or 110"
                  value={moneyline}
                  onChange={(e) => handleMoneylineChange(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="label">Implied Probability</label>
                <div className="result-with-copy">
                  <div className="result-value">
                    {impliedPercentResult !== null 
                      ? `${impliedPercentResult.toFixed(2)}%`
                      : '—'
                    }
                  </div>
                  {impliedPercentResult !== null && (
                    <button
                      type="button"
                      className="btn btn-small btn-secondary"
                      onClick={() => copyToClipboard(`${impliedPercentResult.toFixed(2)}%`)}
                    >
                      Copy
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Implied % → Moneyline */}
            <div className="converter-panel">
              <h3 className="panel-title">Implied % → Moneyline</h3>
              <div className="form-group">
                <label className="label">Probability (%)</label>
                <input
                  type="text"
                  className="input oddsInput"
                  placeholder="0-100 or 0-1"
                  value={impliedPercent}
                  onChange={(e) => handlePercentChange(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="label">Moneyline</label>
                <div className="result-with-copy">
                  <div className="result-value">
                    {moneylineResult !== null
                      ? (moneylineResult >= 0 ? `+${moneylineResult}` : moneylineResult.toString())
                      : '—'
                    }
                  </div>
                  {moneylineResult !== null && (
                    <button
                      type="button"
                      className="btn btn-small btn-secondary"
                      onClick={() => copyToClipboard(moneylineResult >= 0 ? `+${moneylineResult}` : moneylineResult.toString())}
                    >
                      Copy
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Vig Removal Toggle */}
          <div className="form-group" style={{ marginTop: '2rem' }}>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeVigRemoval}
                onChange={(e) => setIncludeVigRemoval(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span>Include Vig Removal (2-way)</span>
            </label>
          </div>

          {/* Vig Removal Inputs */}
          {includeVigRemoval && (
            <div className="vig-removal-section">
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div className="form-group">
                  <label className="label">Side A Moneyline</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="-110"
                    value={moneylineA}
                    onChange={(e) => setMoneylineA(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Side B Moneyline</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="+150"
                    value={moneylineB}
                    onChange={(e) => setMoneylineB(e.target.value)}
                  />
                </div>
              </div>
              {fairPercentA !== null && (
                <div className="fair-probability-result" style={{ marginTop: '1rem' }}>
                  <div className="result-card">
                    <div className="result-label">Fair % (no vig)</div>
                    <div className="result-value-large">
                      Side A: {fairPercentA.toFixed(2)}% | Side B: {fairPercentB.toFixed(2)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Examples */}
          <div className="examples-section" style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
            <h3 className="section-subtitle">Quick Examples</h3>
            <div className="examples-grid">
              <div className="example-item">
                <strong>-110</strong> → <strong>52.38%</strong>
              </div>
              <div className="example-item">
                <strong>+150</strong> → <strong>40.00%</strong>
              </div>
              <div className="example-item">
                <strong>60%</strong> → <strong>-150</strong>
              </div>
              <div className="example-item">
                <strong>40%</strong> → <strong>+150</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OddsConverter

