import { useState, useMemo } from 'react'
import { generateInsights } from '../lib/insightsEngine'
import { parseOdds } from '../lib/oddsUtils'
import './Insights.css'

export default function Insights({ bets = [] }) {
  const [timeRange, setTimeRange] = useState('all')
  const [activeTab, setActiveTab] = useState('straight')

  const straightBets = bets.filter(bet => bet.betType !== 'parlay')
  const parlayBets = bets.filter(bet => bet.betType === 'parlay')
  
  const insights = useMemo(() => {
    const source = activeTab === 'parlay' ? [] : straightBets
    return generateInsights(source, { timeRange })
  }, [straightBets, timeRange, activeTab])

  const summary = useMemo(() => {
    const source = activeTab === 'parlay' ? parlayBets : straightBets
    return calculateSummaryStats(source)
  }, [activeTab, straightBets, parlayBets])

  const parlayDistribution = useMemo(() => {
    const buckets = { two: 0, three: 0, fourPlus: 0 }
    parlayBets.forEach(bet => {
      const legs = Array.isArray(bet.legs) ? bet.legs.length : 0
      if (legs === 2) buckets.two += 1
      else if (legs === 3) buckets.three += 1
      else if (legs >= 4) buckets.fourPlus += 1
    })
    return buckets
  }, [parlayBets])
  
  // Group insights by severity
  const goodInsights = insights.filter(i => i.severity === 'good')
  const warningInsights = insights.filter(i => i.severity === 'warning')
  const neutralInsights = insights.filter(i => i.severity === 'neutral')
  
  return (
    <div className="insights-container">
      <div className="insights-header">
        <h2 className="insights-title">Insights</h2>
        <div className="rounding-toggle-group">
          <button
            className={`rounding-toggle ${activeTab === 'straight' ? 'active' : ''}`}
            onClick={() => setActiveTab('straight')}
          >
            Straights
          </button>
          <button
            className={`rounding-toggle ${activeTab === 'parlay' ? 'active' : ''}`}
            onClick={() => setActiveTab('parlay')}
          >
            Parlays
          </button>
        </div>
        <div className="time-range-filter">
          <label htmlFor="timeRange" className="time-range-label">Time Range:</label>
          <select
            id="timeRange"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="time-range-select"
          >
            <option value="all">All Time</option>
            <option value="30d">Last 30 Days</option>
            <option value="7d">Last 7 Days</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-section">
          <h3 className="section-title">{activeTab === 'parlay' ? 'Parlay Summary' : 'Straight Summary'}</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-label">Total Bets</div>
              <div className="stat-card-value">{summary.totalBets}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">ROI</div>
              <div className="stat-card-value">{summary.roi.toFixed(1)}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Avg Stake</div>
              <div className="stat-card-value">${summary.avgStake.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Avg Odds (Decimal)</div>
              <div className="stat-card-value">{summary.avgOdds.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Win Rate</div>
              <div className="stat-card-value">{summary.winRate.toFixed(1)}%</div>
            </div>
          </div>
          {activeTab === 'parlay' && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>Parlay Size Distribution</h4>
              <div style={{ color: 'var(--text-secondary)' }}>
                2-leg: {parlayDistribution.two} · 3-leg: {parlayDistribution.three} · 4+: {parlayDistribution.fourPlus}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {insights.length === 0 ? (
        <div className="insights-empty">
          <p>
            {activeTab === 'parlay'
              ? 'Parlay insights will appear once you log more parlay entries.'
              : 'No insights available yet. Keep logging bets to unlock personalized insights.'}
          </p>
        </div>
      ) : (
        <>
          {goodInsights.length > 0 && (
            <section className="insights-section">
              <h3 className="insights-section-title">What You're Best At</h3>
              <div className="insights-grid">
                {goodInsights.map(insight => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </section>
          )}
          
          {warningInsights.length > 0 && (
            <section className="insights-section">
              <h3 className="insights-section-title insights-section-title-warning">Leaks to Avoid</h3>
              <div className="insights-grid">
                {warningInsights.map(insight => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </section>
          )}
          
          {neutralInsights.length > 0 && (
            <section className="insights-section">
              <h3 className="insights-section-title insights-section-title-neutral">Patterns</h3>
              <div className="insights-grid">
                {neutralInsights.map(insight => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function InsightCard({ insight }) {
  const severityClass = `insight-card-${insight.severity}`
  
  return (
    <div className={`insight-card ${severityClass}`}>
      <div className="insight-card-header">
        <h4 className="insight-card-title">{insight.title}</h4>
        {insight.metricLabel && insight.metricValue && (
          <div className="insight-card-metric">
            <span className="insight-metric-label">{insight.metricLabel}:</span>
            <span className="insight-metric-value">{insight.metricValue}</span>
          </div>
        )}
      </div>
      
      <p className="insight-card-message">{insight.message}</p>
      
      {insight.evidence && (
        <div className="insight-card-evidence">
          <div className="evidence-row">
            {insight.evidence.sampleSize && (
              <span className="evidence-item">
                <strong>Sample:</strong> {insight.evidence.sampleSize} bets
              </span>
            )}
            {insight.evidence.pnl !== undefined && (
              <span className="evidence-item">
                <strong>P&L:</strong> ${insight.evidence.pnl >= 0 ? '+' : ''}{insight.evidence.pnl.toFixed(2)}
              </span>
            )}
            {insight.evidence.roi !== undefined && (
              <span className="evidence-item">
                <strong>ROI:</strong> {insight.evidence.roi >= 0 ? '+' : ''}{insight.evidence.roi.toFixed(1)}%
              </span>
            )}
            {insight.evidence.winRate !== undefined && (
              <span className="evidence-item">
                <strong>Win Rate:</strong> {insight.evidence.winRate.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}
      
      {insight.recommendation && (
        <div className="insight-card-recommendation">
          <strong>💡 Recommendation:</strong> {insight.recommendation}
        </div>
      )}
    </div>
  )
}

function calculateProfit(bet) {
  if (bet.profit !== undefined) return bet.profit
  const stake = bet.stake || 0
  if (bet.betType === 'parlay') {
    if (bet.result === 'Win' && bet.payout !== undefined) {
      return bet.payout - stake
    }
    if (bet.result === 'Loss') return -stake
    return 0
  }
  const decimalOdds = bet.decimalOdds || parseOdds(bet.odds, bet.oddsFormat)
  if (!decimalOdds) return 0
  if (bet.result === 'Win') return stake * (decimalOdds - 1)
  if (bet.result === 'Loss') return -stake
  return 0
}

function getDecimalOddsForBet(bet) {
  if (bet.decimalOdds) return bet.decimalOdds
  if (bet.betType === 'parlay' && bet.impliedProb) {
    return 1 / bet.impliedProb
  }
  return parseOdds(bet.odds, bet.oddsFormat)
}

function calculateSummaryStats(bets) {
  const totalBets = bets.length
  if (!totalBets) {
    return { totalBets: 0, roi: 0, avgStake: 0, avgOdds: 0, winRate: 0 }
  }

  const totalStake = bets.reduce((sum, bet) => sum + (bet.stake || 0), 0)
  const totalProfit = bets.reduce((sum, bet) => sum + calculateProfit(bet), 0)
  const wins = bets.filter(b => b.result === 'Win').length
  const losses = bets.filter(b => b.result === 'Loss').length
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0
  const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0
  const avgStake = totalStake / totalBets
  const avgOdds = bets.reduce((sum, bet) => sum + (getDecimalOddsForBet(bet) || 0), 0) / totalBets

  return { totalBets, roi, avgStake, avgOdds, winRate }
}

