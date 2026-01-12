import { useState, useMemo } from 'react'
import { generateInsights } from '../lib/insightsEngine'
import './Insights.css'

export default function Insights({ bets = [] }) {
  const [timeRange, setTimeRange] = useState('all')
  
  const insights = useMemo(() => {
    return generateInsights(bets, { timeRange })
  }, [bets, timeRange])
  
  // Group insights by severity
  const goodInsights = insights.filter(i => i.severity === 'good')
  const warningInsights = insights.filter(i => i.severity === 'warning')
  const neutralInsights = insights.filter(i => i.severity === 'neutral')
  
  return (
    <div className="insights-container">
      <div className="insights-header">
        <h2 className="insights-title">Insights</h2>
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
      
      {insights.length === 0 ? (
        <div className="insights-empty">
          <p>No insights available yet. Keep logging bets to unlock personalized insights.</p>
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

