import { useState, useMemo } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './Dashboard.css'

function Dashboard({ bets, profileId }) {
  const [timeRange, setTimeRange] = useState('all')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [betCountWindow, setBetCountWindow] = useState('all')

  // Filter bets based on time range and count window
  const filteredBets = useMemo(() => {
    let filtered = [...bets].sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date))

    // Apply time range filter
    const now = new Date()
    if (timeRange === 'last7') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      filtered = filtered.filter(b => new Date(b.timestamp || b.date) >= sevenDaysAgo)
    } else if (timeRange === 'last30') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      filtered = filtered.filter(b => new Date(b.timestamp || b.date) >= thirtyDaysAgo)
    } else if (timeRange === 'thismonth') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      filtered = filtered.filter(b => new Date(b.timestamp || b.date) >= firstOfMonth)
    } else if (timeRange === 'custom') {
      if (customDateFrom) {
        const fromDate = new Date(customDateFrom)
        filtered = filtered.filter(b => new Date(b.timestamp || b.date) >= fromDate)
      }
      if (customDateTo) {
        filtered = filtered.filter(b => new Date(b.timestamp || b.date) <= new Date(customDateTo + 'T23:59:59'))
      }
    }

    // Apply bet count window
    if (betCountWindow !== 'all') {
      const count = parseInt(betCountWindow)
      filtered = filtered.slice(-count)
    }

    return filtered
  }, [bets, timeRange, customDateFrom, customDateTo, betCountWindow])

  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalRisked = filteredBets.reduce((sum, b) => sum + (b.stake || 0), 0)
    const profits = filteredBets.map(b => b.profit || 0)
    const netPnl = profits.reduce((sum, p) => sum + p, 0)
    const totalWon = profits.filter(p => p > 0).reduce((sum, p) => sum + p, 0)
    const totalLost = Math.abs(profits.filter(p => p < 0).reduce((sum, p) => sum + p, 0))
    const wins = filteredBets.filter(b => b.result === 'Win').length
    const winRate = filteredBets.length > 0 ? (wins / filteredBets.length) * 100 : 0
    const roi = totalRisked > 0 ? (netPnl / totalRisked) * 100 : 0
    const avgStake = filteredBets.length > 0 ? totalRisked / filteredBets.length : 0
    const biggestWin = profits.length > 0 ? Math.max(...profits) : 0
    const biggestLoss = profits.length > 0 ? Math.min(...profits) : 0

    return {
      netPnl,
      totalRisked,
      totalWon,
      totalLost,
      winRate,
      roi,
      avgStake,
      biggestWin,
      biggestLoss
    }
  }, [filteredBets])

  // Calculate cumulative P&L data
  const cumulativeData = useMemo(() => {
    let runningTotal = 0
    return filteredBets.map(bet => {
      runningTotal += bet.profit || 0
      return {
        date: new Date(bet.timestamp || bet.date).toLocaleDateString(),
        datetime: bet.timestamp || bet.date,
        pnl: runningTotal,
        profit: bet.profit || 0
      }
    }).sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
  }, [filteredBets])

  // Calculate daily P&L data
  const dailyData = useMemo(() => {
    const dailyMap = {}
    filteredBets.forEach(bet => {
      const date = new Date(bet.timestamp || bet.date).toLocaleDateString()
      if (!dailyMap[date]) {
        dailyMap[date] = 0
      }
      dailyMap[date] += bet.profit || 0
    })
    return Object.entries(dailyMap)
      .map(([date, pnl]) => ({ date, pnl }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
  }, [filteredBets])

  // Calculate profit by sport
  const sportData = useMemo(() => {
    const sportMap = {}
    filteredBets.forEach(bet => {
      if (!sportMap[bet.sport]) {
        sportMap[bet.sport] = 0
      }
      sportMap[bet.sport] += bet.profit || 0
    })
    return Object.entries(sportMap)
      .map(([sport, profit]) => ({ sport, profit }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 8)
  }, [filteredBets])

  // Calculate profit by market type
  const marketData = useMemo(() => {
    const marketMap = {}
    filteredBets.forEach(bet => {
      if (!marketMap[bet.marketType]) {
        marketMap[bet.marketType] = 0
      }
      marketMap[bet.marketType] += bet.profit || 0
    })
    return Object.entries(marketMap)
      .map(([market, profit]) => ({ market, profit }))
      .sort((a, b) => b.profit - a.profit)
  }, [filteredBets])

  // Calculate profit by book/app
  const bookData = useMemo(() => {
    const bookMap = {}
    filteredBets.forEach(bet => {
      const book = bet.book || 'Unknown'
      if (!bookMap[book]) {
        bookMap[book] = 0
      }
      bookMap[book] += bet.profit || 0
    })
    return Object.entries(bookMap)
      .map(([book, profit]) => ({ book, profit }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 8) // Top 8
  }, [filteredBets])

  // Calculate streaks
  const streaks = useMemo(() => {
    if (filteredBets.length === 0) {
      return { current: 0, currentType: null, bestWin: 0, worstLoss: 0 }
    }

    const sorted = [...filteredBets].sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date))
    let currentStreak = 1
    let currentType = sorted[sorted.length - 1].result
    let bestWinStreak = 0
    let worstLossStreak = 0
    let tempWinStreak = 0
    let tempLossStreak = 0

    for (let i = sorted.length - 2; i >= 0; i--) {
      if (sorted[i].result === currentType) {
        currentStreak++
      } else {
        break
      }
    }

    sorted.forEach(bet => {
      if (bet.result === 'Win') {
        tempWinStreak++
        tempLossStreak = 0
        bestWinStreak = Math.max(bestWinStreak, tempWinStreak)
      } else if (bet.result === 'Loss') {
        tempLossStreak++
        tempWinStreak = 0
        worstLossStreak = Math.max(worstLossStreak, tempLossStreak)
      } else {
        tempWinStreak = 0
        tempLossStreak = 0
      }
    })

    return {
      current: currentStreak,
      currentType,
      bestWin: bestWinStreak,
      worstLoss: worstLossStreak
    }
  }, [filteredBets])

  // Calculate risk stats
  const riskStats = useMemo(() => {
    const stakes = filteredBets.map(b => b.stake || 0).filter(s => s > 0)
    const maxStake = stakes.length > 0 ? Math.max(...stakes) : 0
    const avgStake = stakes.length > 0 ? stakes.reduce((a, b) => a + b, 0) / stakes.length : 0
    const above50 = stakes.filter(s => s > 50).length
    const above100 = stakes.filter(s => s > 100).length
    const above250 = stakes.filter(s => s > 250).length
    const pctAbove50 = stakes.length > 0 ? (above50 / stakes.length) * 100 : 0
    const pctAbove100 = stakes.length > 0 ? (above100 / stakes.length) * 100 : 0
    const pctAbove250 = stakes.length > 0 ? (above250 / stakes.length) * 100 : 0

    return { maxStake, avgStake, pctAbove50, pctAbove100, pctAbove250 }
  }, [filteredBets])

  // Calculate strengths and avoid list
  const strengthsAndAvoid = useMemo(() => {
    // By sport
    const sportMap = {}
    filteredBets.forEach(bet => {
      if (!sportMap[bet.sport]) {
        sportMap[bet.sport] = { bets: [], profit: 0, risked: 0 }
      }
      sportMap[bet.sport].bets.push(bet)
      sportMap[bet.sport].profit += bet.profit || 0
      sportMap[bet.sport].risked += bet.stake || 0
    })
    const sportData = Object.entries(sportMap).map(([sport, data]) => ({
      category: sport,
      type: 'sport',
      bets: data.bets.length,
      roi: data.risked > 0 ? (data.profit / data.risked) * 100 : 0,
      profit: data.profit
    }))

    // By market type
    const marketMap = {}
    filteredBets.forEach(bet => {
      if (!marketMap[bet.marketType]) {
        marketMap[bet.marketType] = { bets: [], profit: 0, risked: 0 }
      }
      marketMap[bet.marketType].bets.push(bet)
      marketMap[bet.marketType].profit += bet.profit || 0
      marketMap[bet.marketType].risked += bet.stake || 0
    })
    const marketData = Object.entries(marketMap).map(([market, data]) => ({
      category: market,
      type: 'market',
      bets: data.bets.length,
      roi: data.risked > 0 ? (data.profit / data.risked) * 100 : 0,
      profit: data.profit
    }))

    // By book/app
    const bookMap = {}
    filteredBets.forEach(bet => {
      const book = bet.book || 'Unknown'
      if (!bookMap[book]) {
        bookMap[book] = { bets: [], profit: 0, risked: 0 }
      }
      bookMap[book].bets.push(bet)
      bookMap[book].profit += bet.profit || 0
      bookMap[book].risked += bet.stake || 0
    })
    const bookData = Object.entries(bookMap).map(([book, data]) => ({
      category: book,
      type: 'book',
      bets: data.bets.length,
      roi: data.risked > 0 ? (data.profit / data.risked) * 100 : 0,
      profit: data.profit
    }))

    const allCategories = [...sportData, ...marketData, ...bookData].filter(c => c.bets >= 10)
    const strengths = [...allCategories].sort((a, b) => b.roi - a.roi).slice(0, 3)
    const avoid = [...allCategories].sort((a, b) => a.roi - b.roi).slice(0, 3)

    return { strengths, avoid }
  }, [filteredBets])

  return (
    <div className="dashboard-container">
      {/* Filters */}
      <div className="card">
        <div className="card-section">
          <h2 className="section-title">Filters</h2>
          <div className="form-grid">
            <div className="form-group">
              <label className="label">Time Range</label>
              <select
                className="input"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
              >
                <option value="all">All Time</option>
                <option value="last7">Last 7 Days</option>
                <option value="last30">Last 30 Days</option>
                <option value="thismonth">This Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            {timeRange === 'custom' && (
              <>
                <div className="form-group">
                  <label className="label">From Date</label>
                  <input
                    type="date"
                    className="input"
                    value={customDateFrom}
                    onChange={(e) => setCustomDateFrom(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="label">To Date</label>
                  <input
                    type="date"
                    className="input"
                    value={customDateTo}
                    onChange={(e) => setCustomDateTo(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="form-group">
              <label className="label">Bet Count Window</label>
              <select
                className="input"
                value={betCountWindow}
                onChange={(e) => setBetCountWindow(e.target.value)}
              >
                <option value="all">All Bets</option>
                <option value="10">Last 10</option>
                <option value="25">Last 25</option>
                <option value="50">Last 50</option>
                <option value="100">Last 100</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Net P&L</div>
          <div className={`kpi-value ${kpis.netPnl >= 0 ? 'positive' : 'negative'}`}>
            ${kpis.netPnl.toFixed(2)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Risked</div>
          <div className="kpi-value">${kpis.totalRisked.toFixed(2)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Won</div>
          <div className="kpi-value positive">${kpis.totalWon.toFixed(2)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Lost</div>
          <div className="kpi-value negative">${kpis.totalLost.toFixed(2)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Win Rate</div>
          <div className="kpi-value">{kpis.winRate.toFixed(1)}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">ROI</div>
          <div className={`kpi-value ${kpis.roi >= 0 ? 'positive' : 'negative'}`}>
            {kpis.roi.toFixed(2)}%
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg Stake</div>
          <div className="kpi-value">${kpis.avgStake.toFixed(2)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Biggest Win / Loss</div>
          <div className="kpi-value">
            <span className="positive">${kpis.biggestWin.toFixed(2)}</span>
            {' / '}
            <span className="negative">${kpis.biggestLoss.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-section">
          <h3 className="section-title">Cumulative P&L</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={cumulativeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="date" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--border-color)' }} />
              <Line type="monotone" dataKey="pnl" stroke="var(--accent-highlight)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-section">
          <h3 className="section-title">Daily P&L</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="date" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--border-color)' }} />
              <Bar dataKey="pnl" fill="var(--accent-highlight)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-section">
            <h3 className="section-title">Profit by Sport/League</h3>
            <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sportData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="sport" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--border-color)' }} />
              <Bar dataKey="profit" fill="var(--accent-highlight)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-section">
            <h3 className="section-title">Profit by Market Type</h3>
            <ResponsiveContainer width="100%" height={300}>
            <BarChart data={marketData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="market" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--border-color)' }} />
              <Bar dataKey="profit" fill="var(--accent-highlight)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-section">
            <h3 className="section-title">Profit by Book/App</h3>
            <ResponsiveContainer width="100%" height={300}>
            <BarChart data={bookData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="book" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--border-color)' }} />
              <Bar dataKey="profit" fill="var(--accent-highlight)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Streaks & Risk Stats */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-section">
          <h3 className="section-title">Streaks</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-label">Current Streak</div>
              <div className="stat-card-value">
                {streaks.current} {streaks.currentType || 'N/A'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Best Win Streak</div>
              <div className="stat-card-value positive">{streaks.bestWin}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Worst Loss Streak</div>
              <div className="stat-card-value negative">{streaks.worstLoss}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-section">
          <h3 className="section-title">Risk Stats</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-label">Max Stake</div>
              <div className="stat-card-value">${riskStats.maxStake.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Average Stake</div>
              <div className="stat-card-value">${riskStats.avgStake.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Above $50</div>
              <div className="stat-card-value">{riskStats.pctAbove50.toFixed(1)}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Above $100</div>
              <div className="stat-card-value">{riskStats.pctAbove100.toFixed(1)}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Above $250</div>
              <div className="stat-card-value">{riskStats.pctAbove250.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Strengths & Avoid */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-section">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <h3 className="section-title" style={{ color: 'var(--accent-green)' }}>Strengths</h3>
              {strengthsAndAvoid.strengths.length > 0 ? (
                <div className="breakdown-list">
                  {strengthsAndAvoid.strengths.map((item, idx) => (
                    <div key={idx} className="breakdown-item positive">
                      <div><strong>{item.category}</strong></div>
                      <div>ROI: {item.roi.toFixed(1)}% • {item.bets} bets • ${item.profit >= 0 ? '+' : ''}{item.profit.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>Need at least 10 bets in a category</p>
              )}
            </div>
            <div>
              <h3 className="section-title" style={{ color: 'var(--accent-red)' }}>Avoid</h3>
              {strengthsAndAvoid.avoid.length > 0 ? (
                <div className="breakdown-list">
                  {strengthsAndAvoid.avoid.map((item, idx) => (
                    <div key={idx} className="breakdown-item negative">
                      <div><strong>{item.category}</strong></div>
                      <div>ROI: {item.roi.toFixed(1)}% • {item.bets} bets • ${item.profit >= 0 ? '+' : ''}{item.profit.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>Need at least 10 bets in a category</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard

