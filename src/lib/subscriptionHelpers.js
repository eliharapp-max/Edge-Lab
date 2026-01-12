/**
 * Count bets created in the last 7 rolling days
 * @param {Array} bets - Array of bet objects
 * @param {Date|number} now - Current time (defaults to Date.now())
 * @returns {number} Count of bets in the last 7 days
 */
export function getBetsLast7DaysCount(bets, now = Date.now()) {
  const nowDate = typeof now === 'number' ? new Date(now) : now
  const sevenDaysAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000)
  
  return bets.filter(bet => {
    // Use created_at if available, otherwise use timestamp or date
    const betDate = bet.created_at 
      ? new Date(bet.created_at)
      : bet.timestamp 
        ? new Date(bet.timestamp)
        : new Date(bet.date)
    
    return betDate >= sevenDaysAgo
  }).length
}
