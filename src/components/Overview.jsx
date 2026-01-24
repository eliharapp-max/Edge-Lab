import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './Overview.css'

function Overview({ bets = [] }) {
  // Calculate metrics
  const metrics = useMemo(() => {
    if (bets.length === 0) {
      return {
        totalPnl: 0,
        totalStaked: 0,
        winRate: 0,
        roi: 0
      }
    }

    const totalStaked = bets.reduce((sum, b) => sum + (b.stake || 0), 0)
    const profits = bets.map(b => b.profit || 0)
    const totalPnl = profits.reduce((sum, p) => sum + p, 0)
    const wins = bets.filter(b => b.result === 'Win').length
    const winRate = bets.length > 0 ? (wins / bets.length) * 100 : 0
    const roi = totalStaked > 0 ? (totalPnl / totalStaked) * 100 : 0

    return {
      totalPnl,
      totalStaked,
      winRate,
      roi
    }
  }, [bets])

  // Calculate cumulative P&L for chart
  const chartData = useMemo(() => {
    if (bets.length === 0) return []

    let runningTotal = 0
    const sortedBets = [...bets]
      .sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date))
      .map(bet => {
        runningTotal += bet.profit || 0
        return {
          date: new Date(bet.timestamp || bet.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          datetime: bet.timestamp || bet.date,
          pnl: runningTotal
        }
      })

    return sortedBets
  }, [bets])

  // Calculate insights
  const insights = useMemo(() => {
    if (bets.length === 0) {
      return {
        bestMarket: null,
        biggestLeak: null,
        currentStreak: null
      }
    }

    // Best Market
    const marketMap = {}
    bets.forEach(bet => {
      if (!marketMap[bet.marketType]) {
        marketMap[bet.marketType] = { profit: 0, count: 0 }
      }
      marketMap[bet.marketType].profit += bet.profit || 0
      marketMap[bet.marketType].count += 1
    })
    const bestMarket = Object.entries(marketMap)
      .filter(([_, data]) => data.count >= 5)
      .sort(([_, a], [__, b]) => (b.profit / b.count) - (a.profit / a.count))[0]

    // Biggest Leak (worst performing market with at least 5 bets)
    const biggestLeak = Object.entries(marketMap)
      .filter(([_, data]) => data.count >= 5)
      .sort(([_, a], [__, b]) => (a.profit / a.count) - (b.profit / b.count))[0]

    // Current Streak
    const sortedBets = [...bets].sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date))
    let currentStreak = 0
    let streakType = null
    for (const bet of sortedBets) {
      if (bet.result === 'Win' && (streakType === 'Win' || streakType === null)) {
        currentStreak++
        streakType = 'Win'
      } else if (bet.result === 'Loss' && (streakType === 'Loss' || streakType === null)) {
        currentStreak++
        streakType = 'Loss'
      } else {
        break
      }
    }

    // Calculate ROI for markets (average profit per bet / average stake)
    const calculateMarketROI = (marketType) => {
      const marketBets = bets.filter(b => b.marketType === marketType)
      if (marketBets.length === 0) return 0
      const totalProfit = marketBets.reduce((sum, b) => sum + (b.profit || 0), 0)
      const totalStaked = marketBets.reduce((sum, b) => sum + (b.stake || 0), 0)
      return totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0
    }

    return {
      bestMarket: bestMarket ? { market: bestMarket[0], roi: calculateMarketROI(bestMarket[0]) } : null,
      biggestLeak: biggestLeak ? { market: biggestLeak[0], roi: calculateMarketROI(biggestLeak[0]) } : null,
      currentStreak: { count: currentStreak, type: streakType }
    }
  }, [bets])

  // Get recent bets (last 10)
  const recentBets = useMemo(() => {
    return [...bets]
      .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date))
      .slice(0, 10)
  }, [bets])

  return (
    <div className="overview-container">
      <div className="overview-header">
        <h2 className="overview-title">Overview</h2>
      </div>

      {/* Metric Cards */}
      <div className="overview-metrics">
        <div className="overview-metric-card">
          <div className="metric-label">Total P&L</div>
          <div className={`metric-value ${metrics.totalPnl >= 0 ? 'positive' : 'negative'}`}>
            ${metrics.totalPnl >= 0 ? '+' : ''}{metrics.totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="overview-metric-card">
          <div className="metric-label">Total Staked</div>
          <div className="metric-value">${metrics.totalStaked.toFixed(2)}</div>
        </div>
        <div className="overview-metric-card">
          <div className="metric-label">Win Rate</div>
          <div className="metric-value">{metrics.winRate.toFixed(1)}%</div>
        </div>
        <div className="overview-metric-card">
          <div className="metric-label">ROI</div>
          <div className={`metric-value ${metrics.roi >= 0 ? 'positive' : 'negative'}`}>
            {metrics.roi >= 0 ? '+' : ''}{metrics.roi.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* P&L Chart */}
      {chartData.length > 0 ? (
        <div className="overview-card">
          <h3 className="overview-section-title">Cumulative P&L</h3>
          <div className="overview-chart">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--text-muted)"
                  style={{ fontSize: '0.75rem' }}
                />
                <YAxis 
                  stroke="var(--text-muted)"
                  style={{ fontSize: '0.75rem' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--panel)', 
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="pnl" 
                  stroke="var(--accent-highlight)" 
                  strokeWidth={2}
                  dot={{ fill: 'var(--accent-highlight)', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="overview-card">
          <h3 className="overview-section-title">Cumulative P&L</h3>
          <div className="overview-empty">No data yet</div>
        </div>
      )}

      {/* Insights Cards */}
      <div className="overview-insights">
        <div className="overview-card">
          <h3 className="overview-section-title">Best Market</h3>
          {insights.bestMarket ? (
            <div className="insight-content">
              <div className="insight-value">{insights.bestMarket.market}</div>
              <div className="insight-label">ROI: {insights.bestMarket.roi >= 0 ? '+' : ''}{insights.bestMarket.roi.toFixed(1)}%</div>
            </div>
          ) : (
            <div className="insight-empty">No data yet</div>
          )}
        </div>
        <div className="overview-card">
          <h3 className="overview-section-title">Biggest Leak</h3>
          {insights.biggestLeak ? (
            <div className="insight-content">
              <div className="insight-value">{insights.biggestLeak.market}</div>
              <div className="insight-label">ROI: {insights.biggestLeak.roi >= 0 ? '+' : ''}{insights.biggestLeak.roi.toFixed(1)}%</div>
            </div>
          ) : (
            <div className="insight-empty">No data yet</div>
          )}
        </div>
        <div className="overview-card">
          <h3 className="overview-section-title">Current Streak</h3>
          {insights.currentStreak && insights.currentStreak.count > 0 ? (
            <div className="insight-content">
              <div className="insight-value">{insights.currentStreak.count} {insights.currentStreak.type === 'Win' ? 'Wins' : 'Losses'}</div>
              <div className="insight-label">{insights.currentStreak.type === 'Win' ? '🔥 Hot' : '❄️ Cold'}</div>
            </div>
          ) : (
            <div className="insight-empty">No data yet</div>
          )}
        </div>
      </div>

      {/* Recent Bets */}
      <div className="overview-card">
        <h3 className="overview-section-title">Recent Bets</h3>
        {recentBets.length > 0 ? (
          <div className="overview-bets-table">
            <div className="overview-bets-header">
              <div>Date</div>
              <div>Sport</div>
              <div>Market</div>
              <div>Stake</div>
              <div>Result</div>
              <div>P&L</div>
            </div>
            {recentBets.map(bet => (
              <div key={bet.id} className="overview-bets-row">
                <div>{new Date(bet.timestamp || bet.date).toLocaleDateString()}</div>
                <div>{bet.sport}</div>
                <div>{bet.marketType}</div>
                <div>${bet.stake?.toFixed(2) || '0.00'}</div>
                <div>{bet.result}</div>
                <div className={bet.profit >= 0 ? 'positive' : 'negative'}>
                  ${bet.profit >= 0 ? '+' : ''}{bet.profit?.toFixed(2) || '0.00'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overview-empty">No bets yet</div>
        )}
      </div>
    </div>
  )
}

export default Overview

