// Local-first bet queue for offline-first Add Bet

const QUEUE_KEY = 'edge_bet_queue'

/**
 * Enqueue a bet to local storage (immediate save, sync later)
 * @param {Object} bet - Bet data payload
 * @returns {Object} Queued bet with id, createdAt, status
 */
export function enqueueBet(bet) {
  const queue = getQueuedBets()
  
  // Generate stable unique ID if missing
  const betId = bet.id || (Date.now().toString(36) + Math.random().toString(36).substr(2))
  
  const queuedBet = {
    id: betId,
    createdAt: bet.createdAt || new Date().toISOString(),
    status: 'pending',
    bet: {
      ...bet,
      id: betId,
      created_at: bet.created_at || bet.createdAt || new Date().toISOString(),
      timestamp: bet.timestamp || bet.date || new Date().toISOString()
    }
  }
  
  queue.push(queuedBet)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  
  console.log('enqueueBet: Bet queued locally', betId)
  return queuedBet
}

/**
 * Get all queued bets from localStorage
 * @returns {Array} Array of queued bets
 */
export function getQueuedBets() {
  try {
    const stored = localStorage.getItem(QUEUE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('getQueuedBets: Error reading queue', error)
    return []
  }
}

/**
 * Mark a queued bet as synced (remove from queue)
 * @param {string} betId - Bet ID to mark as synced
 */
export function markBetSynced(betId) {
  const queue = getQueuedBets()
  const updated = queue.filter(q => q.id !== betId)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(updated))
  console.log('markBetSynced: Bet removed from queue', betId)
}

/**
 * Remove a bet from queue (for user delete)
 * @param {string} betId - Bet ID to remove
 */
export function removeBet(betId) {
  const queue = getQueuedBets()
  const updated = queue.filter(q => q.id !== betId)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(updated))
  console.log('removeBet: Bet removed from queue', betId)
}

/**
 * Update a queued bet (for edit)
 * @param {string} betId - Bet ID to update
 * @param {Object} betUpdate - Partial bet data to update
 */
export function updateQueuedBet(betId, betUpdate) {
  const queue = getQueuedBets()
  const updated = queue.map(q => 
    q.id === betId 
      ? { ...q, bet: { ...q.bet, ...betUpdate }, updatedAt: new Date().toISOString() }
      : q
  )
  localStorage.setItem(QUEUE_KEY, JSON.stringify(updated))
  console.log('updateQueuedBet: Bet updated in queue', betId)
}

/**
 * Get queued bets with pending status
 * @returns {Array} Array of pending bets
 */
export function getPendingBets() {
  return getQueuedBets().filter(q => q.status === 'pending')
}

/**
 * Get all bet data from queue (for merging with synced bets)
 * @returns {Array} Array of bet objects from queue
 */
export function getQueuedBetData() {
  return getQueuedBets().map(q => q.bet)
}

