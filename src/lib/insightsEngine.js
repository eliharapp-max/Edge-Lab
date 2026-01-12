/**
 * Insights Engine - Generates human-readable insights from bet data
 */

/**
 * Calculate bet profit (helper function)
 */
function calculateBetProfit(bet) {
  if (bet.profit !== undefined) {
    return bet.profit
  }
  
  const decimalOdds = bet.decimalOdds
  if (!decimalOdds) return 0
  
  if (bet.result === 'Win') {
    return bet.stake * (decimalOdds - 1)
  } else if (bet.result === 'Loss') {
    return -bet.stake
  }
  return 0 // Push
}

/**
 * Convert decimal odds to implied probability
 */
function impliedProbability(decimalOdds) {
  if (!decimalOdds || decimalOdds <= 0) return null
  return 1 / decimalOdds
}

/**
 * Filter bets by time range
 */
function filterByTimeRange(bets, timeRange) {
  if (!timeRange || timeRange === 'all') return bets
  
  const now = new Date()
  const cutoff = new Date()
  
  if (timeRange === '7d') {
    cutoff.setDate(now.getDate() - 7)
  } else if (timeRange === '30d') {
    cutoff.setDate(now.getDate() - 30)
  }
  
  return bets.filter(bet => {
    const betDate = new Date(bet.timestamp || bet.date)
    return betDate >= cutoff
  })
}

/**
 * Calculate group stats (P&L, ROI, win rate)
 */
function calculateGroupStats(groupBets) {
  const totalStaked = groupBets.reduce((sum, bet) => sum + (bet.stake || 0), 0)
  const totalProfit = groupBets.reduce((sum, bet) => sum + calculateBetProfit(bet), 0)
  const wins = groupBets.filter(b => b.result === 'Win').length
  const losses = groupBets.filter(b => b.result === 'Loss').length
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0
  const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0
  
  return {
    sampleSize: groupBets.length,
    totalStaked,
    pnl: totalProfit,
    roi,
    winRate,
    wins,
    losses
  }
}

/**
 * Generate insights by platform
 */
function insightsByPlatform(filteredBets) {
  const insights = []
  
  // Group by platform/book
  const byPlatform = {}
  filteredBets.forEach(bet => {
    const platform = bet.book || bet.book_app || bet.bookApp || bet.bookUsed || 'Unknown'
    if (!byPlatform[platform]) {
      byPlatform[platform] = []
    }
    byPlatform[platform].push(bet)
  })
  
  // Calculate stats per platform
  const platformStats = Object.entries(byPlatform)
    .map(([platform, bets]) => ({
      platform,
      ...calculateGroupStats(bets)
    }))
    .filter(stat => stat.sampleSize >= 8 && stat.totalStaked >= 50)
  
  if (platformStats.length === 0) return insights
  
  // Find best and worst platforms
  const sortedByROI = [...platformStats].sort((a, b) => b.roi - a.roi)
  const best = sortedByROI[0]
  const worst = sortedByROI[sortedByROI.length - 1]
  
  if (best && best.roi > 0) {
    insights.push({
      id: `platform-best-${best.platform}`,
      title: `Best Platform: ${best.platform}`,
      message: `You've achieved ${best.roi.toFixed(1)}% ROI on ${best.platform} with ${best.sampleSize} bets.`,
      severity: 'good',
      metricLabel: 'ROI',
      metricValue: `${best.roi.toFixed(1)}%`,
      evidence: {
        sampleSize: best.sampleSize,
        pnl: best.pnl,
        roi: best.roi,
        winRate: best.winRate
      },
      recommendation: `Continue focusing on ${best.platform} - it's working well for you.`
    })
  }
  
  if (worst && worst.roi < 0 && worst.platform !== best?.platform) {
    insights.push({
      id: `platform-worst-${worst.platform}`,
      title: `Avoid: ${worst.platform}`,
      message: `${worst.platform} has resulted in a ${worst.roi.toFixed(1)}% ROI loss with ${worst.sampleSize} bets.`,
      severity: 'warning',
      metricLabel: 'ROI',
      metricValue: `${worst.roi.toFixed(1)}%`,
      evidence: {
        sampleSize: worst.sampleSize,
        pnl: worst.pnl,
        roi: worst.roi,
        winRate: worst.winRate
      },
      recommendation: `Consider reducing exposure on ${worst.platform} or reviewing your strategy there.`
    })
  }
  
  return insights
}

/**
 * Generate insights by bet type
 */
function insightsByBetType(filteredBets) {
  const insights = []
  
  // Group by market type
  const byType = {}
  filteredBets.forEach(bet => {
    const type = bet.marketType || bet.type || 'Unknown'
    if (!byType[type]) {
      byType[type] = []
    }
    byType[type].push(bet)
  })
  
  const typeStats = Object.entries(byType)
    .map(([type, bets]) => ({
      type,
      ...calculateGroupStats(bets)
    }))
    .filter(stat => stat.sampleSize >= 8 && stat.totalStaked >= 50)
  
  if (typeStats.length === 0) return insights
  
  const sortedByROI = [...typeStats].sort((a, b) => b.roi - a.roi)
  const best = sortedByROI[0]
  const worst = sortedByROI[sortedByROI.length - 1]
  
  if (best && best.roi > 0) {
    insights.push({
      id: `type-best-${best.type}`,
      title: `Best Market Type: ${best.type}`,
      message: `You perform best on ${best.type} bets with ${best.roi.toFixed(1)}% ROI.`,
      severity: 'good',
      metricLabel: 'ROI',
      metricValue: `${best.roi.toFixed(1)}%`,
      evidence: {
        sampleSize: best.sampleSize,
        pnl: best.pnl,
        roi: best.roi,
        winRate: best.winRate
      },
      recommendation: `Focus on ${best.type} opportunities - your edge is strongest here.`
    })
  }
  
  if (worst && worst.roi < 0 && worst.type !== best?.type) {
    insights.push({
      id: `type-worst-${worst.type}`,
      title: `Avoid: ${worst.type}`,
      message: `${worst.type} bets have been unprofitable with ${worst.roi.toFixed(1)}% ROI.`,
      severity: 'warning',
      metricLabel: 'ROI',
      metricValue: `${worst.roi.toFixed(1)}%`,
      evidence: {
        sampleSize: worst.sampleSize,
        pnl: worst.pnl,
        roi: worst.roi,
        winRate: worst.winRate
      },
      recommendation: `Review your ${worst.type} strategy or reduce frequency.`
    })
  }
  
  return insights
}

/**
 * Generate insights by odds bucket
 */
function insightsByOddsBucket(filteredBets) {
  const insights = []
  
  // Group bets by implied probability bucket
  const buckets = {
    favorites: { label: 'Favorites (≥60%)', min: 0.60, max: 1.0, bets: [] },
    slightFav: { label: 'Slight Favorites (52-60%)', min: 0.52, max: 0.60, bets: [] },
    tossup: { label: 'Tossups (48-52%)', min: 0.48, max: 0.52, bets: [] },
    dogs: { label: 'Underdogs (35-48%)', min: 0.35, max: 0.48, bets: [] },
    longshots: { label: 'Longshots (<35%)', min: 0, max: 0.35, bets: [] }
  }
  
  filteredBets.forEach(bet => {
    const impProb = bet.impliedProb || impliedProbability(bet.decimalOdds)
    if (!impProb) return
    
    // Assign to first matching bucket (most specific)
    if (impProb >= 0.60) {
      buckets.favorites.bets.push(bet)
    } else if (impProb >= 0.52) {
      buckets.slightFav.bets.push(bet)
    } else if (impProb >= 0.48) {
      buckets.tossup.bets.push(bet)
    } else if (impProb >= 0.35) {
      buckets.dogs.bets.push(bet)
    } else {
      buckets.longshots.bets.push(bet)
    }
  })
  
  const bucketStats = Object.entries(buckets)
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      ...calculateGroupStats(bucket.bets)
    }))
    .filter(stat => stat.sampleSize >= 8 && stat.totalStaked >= 50)
  
  if (bucketStats.length === 0) return insights
  
  const sortedByROI = [...bucketStats].sort((a, b) => b.roi - a.roi)
  const best = sortedByROI[0]
  const worst = sortedByROI[sortedByROI.length - 1]
  
  if (best && best.roi > 0) {
    insights.push({
      id: `odds-best-${best.key}`,
      title: `Best Odds Range: ${best.label}`,
      message: `Your ${best.label} bets have generated ${best.roi.toFixed(1)}% ROI.`,
      severity: 'good',
      metricLabel: 'ROI',
      metricValue: `${best.roi.toFixed(1)}%`,
      evidence: {
        sampleSize: best.sampleSize,
        pnl: best.pnl,
        roi: best.roi,
        winRate: best.winRate
      },
      recommendation: `You have an edge in this odds range - target similar opportunities.`
    })
  }
  
  if (worst && worst.roi < 0 && worst.key !== best?.key) {
    insights.push({
      id: `odds-worst-${worst.key}`,
      title: `Avoid: ${worst.label}`,
      message: `${worst.label} bets are losing you ${Math.abs(worst.roi).toFixed(1)}% ROI.`,
      severity: 'warning',
      metricLabel: 'ROI',
      metricValue: `${worst.roi.toFixed(1)}%`,
      evidence: {
        sampleSize: worst.sampleSize,
        pnl: worst.pnl,
        roi: worst.roi,
        winRate: worst.winRate
      },
      recommendation: `Reconsider betting in this odds range or adjust your approach.`
    })
  }
  
  return insights
}

/**
 * Detect tilt / stake discipline issues
 */
function insightsTiltDiscipline(filteredBets) {
  const insights = []
  
  // Sort bets chronologically
  const sortedBets = [...filteredBets].sort((a, b) => {
    const dateA = new Date(a.timestamp || a.date)
    const dateB = new Date(b.timestamp || b.date)
    return dateA - dateB
  })
  
  if (sortedBets.length < 20) return insights // Need enough data
  
  // Calculate overall average stake
  const overallAvgStake = sortedBets.reduce((sum, bet) => sum + (bet.stake || 0), 0) / sortedBets.length
  
  // Check for tilt: stake after losses
  let postLossBets = []
  for (let i = 1; i < sortedBets.length; i++) {
    if (sortedBets[i - 1].result === 'Loss') {
      postLossBets.push(sortedBets[i])
    }
  }
  
  if (postLossBets.length >= 8) {
    const postLossAvgStake = postLossBets.reduce((sum, bet) => sum + (bet.stake || 0), 0) / postLossBets.length
    
    if (postLossAvgStake >= overallAvgStake * 1.25) {
      insights.push({
        id: 'tilt-stake-increase',
        title: 'Tilt Risk: Stake Increases After Losses',
        message: `Your average stake after a loss ($${postLossAvgStake.toFixed(0)}) is ${((postLossAvgStake / overallAvgStake - 1) * 100).toFixed(0)}% higher than your overall average.`,
        severity: 'warning',
        metricLabel: 'Post-Loss Avg Stake',
        metricValue: `$${postLossAvgStake.toFixed(0)}`,
        evidence: {
          sampleSize: postLossBets.length,
          avgStake: postLossAvgStake,
          overallAvgStake
        },
        recommendation: 'Stick to your bankroll management rules - avoid increasing stakes after losses.'
      })
    }
  }
  
  // Detect rapid-fire betting (same day frequency spikes)
  const byDate = {}
  sortedBets.forEach(bet => {
    const dateKey = new Date(bet.timestamp || bet.date).toDateString()
    if (!byDate[dateKey]) {
      byDate[dateKey] = []
    }
    byDate[dateKey].push(bet)
  })
  
  const betsPerDay = Object.values(byDate).map(bets => bets.length)
  const avgBetsPerDay = betsPerDay.reduce((a, b) => a + b, 0) / betsPerDay.length
  const maxBetsInDay = Math.max(...betsPerDay)
  
  if (maxBetsInDay >= avgBetsPerDay * 2 && maxBetsInDay >= 10) {
    insights.push({
      id: 'rapid-betting',
      title: 'Pattern: Rapid Betting Detected',
      message: `You've placed up to ${maxBetsInDay} bets in a single day, well above your average of ${avgBetsPerDay.toFixed(1)}.`,
      severity: 'neutral',
      metricLabel: 'Max Bets/Day',
      metricValue: `${maxBetsInDay}`,
      evidence: {
        maxBetsInDay,
        avgBetsPerDay
      },
      recommendation: 'Consider spacing out bets to maintain discipline and avoid emotional decisions.'
    })
  }
  
  return insights
}

/**
 * Calculate streaks and drawdown
 */
function insightsStreaksDrawdown(filteredBets) {
  const insights = []
  
  // Sort chronologically
  const sortedBets = [...filteredBets].sort((a, b) => {
    const dateA = new Date(a.timestamp || a.date)
    const dateB = new Date(b.timestamp || b.date)
    return dateA - dateB
  })
  
  if (sortedBets.length < 15) return insights
  
  // Calculate cumulative P&L
  let cumulativePL = 0
  const cumulativeSeries = []
  let maxPL = 0
  let maxDrawdown = 0
  
  sortedBets.forEach(bet => {
    cumulativePL += calculateBetProfit(bet)
    cumulativeSeries.push(cumulativePL)
    if (cumulativePL > maxPL) {
      maxPL = cumulativePL
    }
    const drawdown = maxPL - cumulativePL
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
    }
  })
  
  // Calculate streaks
  let currentWinStreak = 0
  let currentLossStreak = 0
  let maxWinStreak = 0
  let maxLossStreak = 0
  
  sortedBets.forEach(bet => {
    if (bet.result === 'Win') {
      currentWinStreak++
      currentLossStreak = 0
      if (currentWinStreak > maxWinStreak) {
        maxWinStreak = currentWinStreak
      }
    } else if (bet.result === 'Loss') {
      currentLossStreak++
      currentWinStreak = 0
      if (currentLossStreak > maxLossStreak) {
        maxLossStreak = currentLossStreak
      }
    } else {
      // Push resets streaks
      currentWinStreak = 0
      currentLossStreak = 0
    }
  })
  
  if (maxDrawdown > 0) {
    insights.push({
      id: 'max-drawdown',
      title: `Max Drawdown: $${maxDrawdown.toFixed(2)}`,
      message: `Your largest peak-to-trough decline was $${maxDrawdown.toFixed(2)}.`,
      severity: maxDrawdown > 500 ? 'warning' : 'neutral',
      metricLabel: 'Drawdown',
      metricValue: `$${maxDrawdown.toFixed(2)}`,
      evidence: {
        maxDrawdown,
        currentPL: cumulativePL
      },
      recommendation: maxDrawdown > 500 ? 'Consider reducing bet sizes during losing streaks.' : 'Your drawdown is manageable, but stay disciplined.'
    })
  }
  
  if (maxLossStreak >= 5) {
    insights.push({
      id: 'longest-losing-streak',
      title: `Longest Losing Streak: ${maxLossStreak} bets`,
      message: `You've had a losing streak of ${maxLossStreak} consecutive bets.`,
      severity: maxLossStreak >= 8 ? 'warning' : 'neutral',
      metricLabel: 'Losing Streak',
      metricValue: `${maxLossStreak}`,
      evidence: {
        maxLossStreak,
        maxWinStreak
      },
      recommendation: maxLossStreak >= 8 ? 'Long losing streaks can indicate strategy issues - review your approach.' : 'All bettors face losing streaks - stay disciplined.'
    })
  }
  
  if (maxWinStreak >= 5) {
    insights.push({
      id: 'best-winning-streak',
      title: `Best Winning Streak: ${maxWinStreak} bets`,
      message: `You've achieved a winning streak of ${maxWinStreak} consecutive bets.`,
      severity: 'good',
      metricLabel: 'Winning Streak',
      metricValue: `${maxWinStreak}`,
      evidence: {
        maxWinStreak,
        maxLossStreak
      },
      recommendation: 'Great consistency! Keep doing what works during hot streaks, but avoid overconfidence.'
    })
  }
  
  return insights
}

/**
 * Main function: Generate all insights
 */
export function generateInsights(bets = [], options = {}) {
  const { timeRange = 'all' } = options
  
  // Filter by time range
  const filteredBets = filterByTimeRange(bets, timeRange)
  
  // Global minimum sample size check
  if (filteredBets.length < 15) {
    return [{
      id: 'not-enough-data',
      title: 'Not Enough Data Yet',
      message: `You need at least 15 bets to generate insights. You currently have ${filteredBets.length} bet${filteredBets.length !== 1 ? 's' : ''}.`,
      severity: 'neutral',
      recommendation: 'Keep logging your bets to unlock personalized insights.'
    }]
  }
  
  // Generate all insight types
  const insights = [
    ...insightsByPlatform(filteredBets),
    ...insightsByBetType(filteredBets),
    ...insightsByOddsBucket(filteredBets),
    ...insightsTiltDiscipline(filteredBets),
    ...insightsStreaksDrawdown(filteredBets)
  ]
  
  return insights
}

