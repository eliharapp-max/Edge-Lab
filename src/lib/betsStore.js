// Canonical Bets Store - Single source of truth for all bets

/**
 * Load bets from encrypted storage
 * @param {Object} options - { currentProfile, currentPin, currentSalt, supabase }
 * @returns {Promise<Array>} Array of bets
 */
export async function loadBets({ currentProfile, currentPin, currentSalt, supabase }) {
  if (!currentProfile || !currentPin || !currentSalt) {
    console.log('loadBets: Missing profile/PIN/salt')
    return []
  }

  if (!currentProfile.id) {
    console.error('loadBets: Missing user_id in currentProfile')
    return []
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !session.user) {
      console.log('loadBets: No session or user')
      return []
    }

    // Verify user_id matches
    if (session.user.id !== currentProfile.id) {
      console.error('loadBets: user_id mismatch', { sessionUserId: session.user.id, profileId: currentProfile.id })
      return []
    }

    const { decryptData, deriveKey } = await import('../utils/crypto')
    const salt = new Uint8Array(currentSalt)
    const encryptionKey = await deriveKey(currentPin, currentProfile.username, salt)

    // Fetch encrypted data
    const { data: userData, error: fetchError } = await supabase
      .from('user_data')
      .select('encrypted_data')
      .eq('user_id', currentProfile.id)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('loadBets: Fetch error', fetchError)
      throw fetchError
    }

    if (userData && userData.encrypted_data) {
      const decrypted = await decryptData(userData.encrypted_data, encryptionKey)
      const loadedBets = decrypted.bets || []
      console.log('PERSIST: loaded bets', loadedBets.length)
      return loadedBets
    } else {
      console.log('loadBets: No data found, returning empty array')
      return []
    }
  } catch (error) {
    console.error('loadBets: Error loading bets', error)
    throw error
  }
}

/**
 * Save bets to encrypted storage
 * @param {Array} betsToSave - Array of bets to save
 * @param {Object} options - { currentProfile, currentPin, currentSalt, supabase, savedSetups }
 * @returns {Promise<Object>} { data, error }
 */
export async function saveBets(betsToSave, { currentProfile, currentPin, currentSalt, supabase, savedSetups = [] }) {
  if (!currentProfile || !currentPin || !currentSalt) {
    console.log('saveBets: Missing profile/PIN/salt')
    return { data: null, error: new Error('Missing authentication data') }
  }

  if (!currentProfile.id) {
    console.error('saveBets: Missing user_id in currentProfile')
    return { data: null, error: new Error('Missing user_id. You must be logged in.') }
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !session.user) {
      console.log('saveBets: No session or user')
      return { data: null, error: new Error('No session. You must be logged in.') }
    }

    // Verify user_id matches
    if (session.user.id !== currentProfile.id) {
      console.error('saveBets: user_id mismatch', { sessionUserId: session.user.id, profileId: currentProfile.id })
      return { data: null, error: new Error('User ID mismatch. Please log in again.') }
    }

    const { encryptData, deriveKey } = await import('../utils/crypto')
    const salt = new Uint8Array(currentSalt)
    const encryptionKey = await deriveKey(currentPin, currentProfile.username, salt)

    // Sort bets by timestamp (newest first)
    const sortedBets = [...betsToSave].sort((a, b) => {
      const dateA = new Date(a.timestamp || a.date)
      const dateB = new Date(b.timestamp || b.date)
      return dateB - dateA // newest first
    })

    const dataToEncrypt = {
      bets: sortedBets,
      savedSetups: savedSetups
    }

    const encrypted = await encryptData(dataToEncrypt, encryptionKey)

    // Upsert encrypted data
    const { data, error } = await supabase
      .from('user_data')
      .upsert({
        user_id: currentProfile.id,
        encrypted_data: encrypted,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })

    if (error) {
      console.error('PERSIST: Save error (RLS/DB issue)', error)
      throw error
    }
    console.log('PERSIST: saved bets', sortedBets.length)
    return { data, error: null }
  } catch (error) {
    console.error('saveBets: Error saving bets', error)
    return { data: null, error }
  }
}

/**
 * Add a new bet
 * @param {Object} betPayload - Bet data
 * @param {Array} currentBets - Current bets array
 * @param {Object} options - Save options
 * @returns {Promise<Array>} Updated bets array
 */
export async function addBet(betPayload, currentBets, options) {
  console.log('addBet called', betPayload)
  
  // CRITICAL: Check authentication before proceeding
  const { currentProfile, supabase } = options || {}
  
  if (!currentProfile || !currentProfile.id) {
    console.error('addBet: Missing currentProfile or user_id')
    throw new Error('You must be logged in to add a bet.')
  }
  
  // Verify session exists
  const { data: { session } } = await supabase.auth.getSession()
  console.log('AUTH session', session)
  console.log('AUTH user_id', session?.user?.id)
  console.log('ADD_BET user_id', currentProfile.id)
  
  if (!session || !session.user || session.user.id !== currentProfile.id) {
    console.error('addBet: No valid session or user_id mismatch')
    throw new Error('You must be logged in to add a bet.')
  }
  
  if (!options.currentPin || !options.currentSalt) {
    console.error('addBet: Missing PIN or salt')
    throw new Error('Authentication data missing. Please log in again.')
  }
  
  // Generate stable unique ID if missing
  const betId = betPayload.id || (Date.now().toString(36) + Math.random().toString(36).substr(2))
  
  // Ensure created_at timestamp
  const newBet = {
    ...betPayload,
    id: betId,
    created_at: betPayload.created_at || new Date().toISOString(),
    timestamp: betPayload.timestamp || betPayload.date || new Date().toISOString()
  }

  const updatedBets = [newBet, ...currentBets]
  
  const saveResult = await saveBets(updatedBets, options)
  console.log('addBet: persist ok', { error: saveResult.error })
  
  if (saveResult.error) {
    throw saveResult.error
  }
  
  console.log('addBet: bets length', updatedBets.length)
  return updatedBets
}

/**
 * Update an existing bet
 * @param {string} betId - Bet ID to update
 * @param {Object} patch - Partial bet data to update
 * @param {Array} currentBets - Current bets array
 * @param {Object} options - Save options
 * @returns {Promise<Array>} Updated bets array
 */
export async function updateBet(betId, patch, currentBets, options) {
  console.log('updateBet called', { betId, patch })
  
  // CRITICAL: Check authentication before proceeding
  const { currentProfile, supabase } = options || {}
  
  if (!currentProfile || !currentProfile.id) {
    console.error('updateBet: Missing currentProfile or user_id')
    throw new Error('You must be logged in to update a bet.')
  }
  
  // Verify session exists
  const { data: { session } } = await supabase.auth.getSession()
  if (!session || !session.user || session.user.id !== currentProfile.id) {
    console.error('updateBet: No valid session or user_id mismatch')
    throw new Error('You must be logged in to update a bet.')
  }
  
  if (!options.currentPin || !options.currentSalt) {
    console.error('updateBet: Missing PIN or salt')
    throw new Error('Authentication data missing. Please log in again.')
  }
  
  const updatedBets = currentBets.map(b => 
    b.id === betId ? { ...b, ...patch, updated_at: new Date().toISOString() } : b
  )
  
  const saveResult = await saveBets(updatedBets, options)
  console.log('updateBet: persist ok', { error: saveResult.error })
  
  if (saveResult.error) {
    throw saveResult.error
  }
  
  console.log('updateBet: bets length', updatedBets.length)
  return updatedBets
}

/**
 * Delete a bet
 * @param {string} betId - Bet ID to delete
 * @param {Array} currentBets - Current bets array
 * @param {Object} options - Save options
 * @returns {Promise<Array>} Updated bets array
 */
export async function deleteBet(betId, currentBets, options) {
  console.log('deleteBet called', betId)
  
  // CRITICAL: Check authentication before proceeding
  const { currentProfile, supabase } = options || {}
  
  if (!currentProfile || !currentProfile.id) {
    console.error('deleteBet: Missing currentProfile or user_id')
    throw new Error('You must be logged in to delete a bet.')
  }
  
  // Verify session exists
  const { data: { session } } = await supabase.auth.getSession()
  if (!session || !session.user || session.user.id !== currentProfile.id) {
    console.error('deleteBet: No valid session or user_id mismatch')
    throw new Error('You must be logged in to delete a bet.')
  }
  
  if (!options.currentPin || !options.currentSalt) {
    console.error('deleteBet: Missing PIN or salt')
    throw new Error('Authentication data missing. Please log in again.')
  }
  
  const updatedBets = currentBets.filter(b => b.id !== betId)
  
  const saveResult = await saveBets(updatedBets, options)
  console.log('deleteBet: persist ok', { error: saveResult.error })
  
  if (saveResult.error) {
    throw saveResult.error
  }
  
  console.log('deleteBet: bets length', updatedBets.length)
  return updatedBets
}

