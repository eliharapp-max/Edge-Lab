import { useState, useEffect, Component } from 'react'

// Error Boundary Component for Add Bet section
class BetFormErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('BetFormErrorBoundary caught error:', error, errorInfo)
    this.setState({
      error: error,
      errorInfo: errorInfo
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '1rem',
          backgroundColor: 'rgba(132, 210, 246, 0.12)',
          border: '2px solid rgba(132, 210, 246, 0.35)',
          borderRadius: '8px',
          margin: '1rem 0'
        }}>
          <h3 style={{ color: 'var(--text)', marginTop: 0 }}>⚠️ Error in Add Bet</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{this.state.error?.message || 'An error occurred'}</p>
          <details style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>Error details</summary>
            <pre style={{
              marginTop: '0.5rem',
              padding: '0.5rem',
              backgroundColor: 'var(--panel)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              fontSize: '0.75rem',
              overflow: 'auto',
              maxHeight: '200px'
            }}>
              {this.state.error?.stack || 'No stack trace'}
              {this.state.errorInfo?.componentStack && (
                <>
                  {'\n\nComponent Stack:'}
                  {this.state.errorInfo.componentStack}
                </>
              )}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--accent)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
import './App.css'
import Auth from './components/Auth'
import ResetPin from './components/ResetPin'
import Overview from './components/Overview'
import Dashboard from './components/Dashboard'
import OddsConverter from './components/OddsConverter'
import Insights from './components/Insights'
import { supabase } from './lib/supabase'
import { deriveKey, encryptData, decryptData, generateSalt, hashPIN } from './utils/crypto'
import { parseOdds, oddsToImpliedProb, impliedProbToPercent, clampNumber } from './lib/oddsUtils'
import { getBestOddsForLeg } from './lib/oddsProvider'
import { loadBets, addBet, updateBet, deleteBet, saveBets } from './lib/betsStore'
import { enqueueBet, getQueuedBets, getQueuedBetData, markBetSynced, removeBet as removeQueuedBet, updateQueuedBet } from './lib/betQueue'

function App() {
  const [checking, setChecking] = useState(true)
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false) // Auth is ready after session check
  const [currentProfile, setCurrentProfile] = useState(null)
  const [isLocked, setIsLocked] = useState(false)
  const [currentPin, setCurrentPin] = useState(null) // Store PIN in memory for encryption operations
  const [activeTab, setActiveTab] = useState('overview')
  const [oddsA, setOddsA] = useState('')
  const [oddsB, setOddsB] = useState('')
  const [totalStake, setTotalStake] = useState('')
  const [rounding, setRounding] = useState(1)
  const [savedSetups, setSavedSetups] = useState([])
  const [legCount, setLegCount] = useState(6)
  const [legOdds, setLegOdds] = useState(['-110', '-110', '-110', '-110', '-110', '-110'])
  const [legOddsFormats, setLegOddsFormats] = useState(['american', 'american', 'american', 'american', 'american', 'american'])
  const [showShopOdds, setShowShopOdds] = useState(false)
  
  // Journal state
  const [bets, setBets] = useState([])
  const [queuedBets, setQueuedBets] = useState([]) // Local pending bets

  const [syncing, setSyncing] = useState(false) // Sync status
  const [editingBet, setEditingBet] = useState(null)
  const [betFormMessage, setBetFormMessage] = useState({ type: null, text: '' }) // 'success' | 'error' | null
  // TEMP DEBUG STATE
  const [betForm, setBetForm] = useState({
    date: new Date().toISOString().slice(0, 16),
    sport: '',
    marketType: 'ML',
    book: '',
    odds: '',
    oddsFormat: 'american',
    stake: '',
    result: 'Win',
    payout: '',
    confidence: 5,
    notes: '',
    betType: 'straight'
  })
  const [parlayLegCount, setParlayLegCount] = useState(2)
  const [parlayLegs, setParlayLegs] = useState([
    { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' },
    { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' }
  ])
  const [filters, setFilters] = useState({
    sport: '',
    marketType: '',
    book: '',
    result: '',
    oddsMin: '',
    oddsMax: '',
    dateFrom: '',
    dateTo: ''
  })

  const [currentSalt, setCurrentSalt] = useState(null)
  const [unlockPin, setUnlockPin] = useState('') // For unlock flow
  const [unlockError, setUnlockError] = useState('')

  // Force login screen as first screen - check session on mount
  useEffect(() => {
    let sessionChecked = false

    const checkSession = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      setSession(currentSession ?? null)
      setChecking(false)
      sessionChecked = true

      // If session exists, load profile
      if (currentSession && currentSession.user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('username, email, user_id')
          .eq('user_id', currentSession.user.id)
          .single()

        if (profile) {
          setCurrentProfile({
            id: profile.user_id,
            username: profile.username,
            email: profile.email
          })
          setIsLocked(false)
        }
      } else {
        setCurrentProfile(null)
      }

      setAuthReady(true)
    }
    checkSession()

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setSession(currentSession ?? null)
      setAuthReady(true)
      
      if (event === 'SIGNED_OUT') {
        setCurrentProfile(null)
        setIsLocked(true)
        setCurrentPin(null)
        setCurrentSalt(null)
        setBets([])
        setSavedSetups([])
        setAuthReady(false) // Reset auth ready on sign out
      } else if (event === 'SIGNED_IN' && currentSession) {
        setIsLocked(false)
        // Load profile on sign in
        if (currentSession.user) {
          supabase
            .from('user_profiles')
            .select('username, email, user_id')
            .eq('user_id', currentSession.user.id)
            .single()
            .then(({ data: profile }) => {
              if (profile) {
                setCurrentProfile({
                  id: profile.user_id,
                  username: profile.username,
                  email: profile.email
                })
              }
            })
        }
      }

      // Mark auth as ready if session check has also completed
      if (sessionChecked) {
        setAuthReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load persisted bets after auth + PIN unlock
  useEffect(() => {
    const loadPersistedBets = async () => {
      // Guard: Only load if auth is ready AND PIN is unlocked
      if (!authReady || !session?.user?.id || !currentPin || !currentSalt || !currentProfile) {
        console.log('PERSIST: Skipping load - auth not ready or PIN not unlocked')
        return // Wait for unlock
      }

      // Verify profile matches session
      if (currentProfile.id !== session.user.id) {
        console.log('PERSIST: Skipping load - profile mismatch')
        return
      }
      
      // Only load if bets array is empty (avoid reloading unnecessarily)
      if (bets.length === 0) {
        try {
          console.log('PERSIST: Loading bets from Supabase...')
          const loadedBets = await loadBets({
            currentProfile,
            currentPin,
            currentSalt,
            supabase
          })
          if (loadedBets && loadedBets.length > 0) {
            setBets(loadedBets)
            console.log('PERSIST: loaded bets', loadedBets.length)
          } else {
            console.log('PERSIST: No bets found in storage')
          }
        } catch (loadError) {
          console.error('PERSIST: Failed to load bets', loadError)
          // Don't show error - just log it
        }
      }
      
      // Load queued bets for display
      const queued = getQueuedBetData()
      setQueuedBets(queued)
      
      // Attempt sync if auth is available
      trySyncQueue()
    }
    
    loadPersistedBets()
  }, [authReady, session, currentPin, currentSalt, currentProfile])

  // Subscribe to auth changes for sync
  useEffect(() => {
    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Attempt sync on sign in if queued bets exist
      if (event === 'SIGNED_IN' && session?.user?.id) {
        const queued = getQueuedBetData()
        if (queued.length > 0) {
          trySyncQueue()
        }
      }
    })
    
    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  const handleAuthenticated = async (profileData) => {
    setCurrentProfile({
      id: profileData.id,
      username: profileData.username,
      email: profileData.email
    })
    setIsLocked(false)
    setCurrentPin(profileData._pin)
    
    // Load salt from profile if not provided
    if (profileData._salt) {
      setCurrentSalt(profileData._salt)
    } else {
      // Try to load salt from user_profiles
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('salt')
          .eq('user_id', profileData.id)
          .single()
        
        if (profile && profile.salt) {
          setCurrentSalt(Array.isArray(profile.salt) ? profile.salt : profile.salt)
        }
      } catch (error) {
        console.error('Error loading salt:', error)
      }
    }

    // Load bets from canonical store
    const profileForStore = {
      id: profileData.id,
      username: profileData.username,
      email: profileData.email
    }
    const saltForStore = profileData._salt || currentSalt
    
    if (saltForStore) {
      try {
        const loadedBets = await loadBets({
          currentProfile: profileForStore,
          currentPin: profileData._pin,
          currentSalt: saltForStore,
          supabase
        })
        setBets(loadedBets)
        console.log('handleAuthenticated: Loaded', loadedBets.length, 'bets from store')
        
        // Also load savedSetups if available in decryptedData
        if (profileData.decryptedData && profileData.decryptedData.savedSetups) {
          setSavedSetups(profileData.decryptedData.savedSetups.slice(0, 20))
        } else {
          // Try to load from storage
          try {
            const { decryptData, deriveKey } = await import('./utils/crypto')
            const salt = new Uint8Array(saltForStore)
            const encryptionKey = await deriveKey(profileData._pin, profileForStore.username, salt)
            const { data: userData } = await supabase
              .from('user_data')
              .select('encrypted_data')
              .eq('user_id', profileForStore.id)
              .single()
            if (userData && userData.encrypted_data) {
              const decrypted = await decryptData(userData.encrypted_data, encryptionKey)
              setSavedSetups((decrypted.savedSetups || []).slice(0, 20))
            }
          } catch (err) {
            console.error('Error loading savedSetups:', err)
          }
        }
      } catch (error) {
        console.error('Error loading bets:', error)
        // Fallback to decryptedData if available
        if (profileData.decryptedData) {
          setBets(profileData.decryptedData.bets || [])
          setSavedSetups((profileData.decryptedData.savedSetups || []).slice(0, 20))
        } else {
          setBets([])
          setSavedSetups([])
        }
      }
    } else {
      // Fallback to decryptedData if salt not available
      if (profileData.decryptedData) {
        setBets(profileData.decryptedData.bets || [])
        setSavedSetups((profileData.decryptedData.savedSetups || []).slice(0, 20))
      } else {
        setBets([])
        setSavedSetups([])
      }
    }
  }

  // Load bets from canonical store
  const loadBetsFromStorage = async () => {
    if (!currentProfile || !currentPin || !currentSalt) {
      console.log('LOAD_BETS: Missing profile/PIN/salt')
      return []
    }

    try {
      const loadedBets = await loadBets({
        currentProfile,
        currentPin,
        currentSalt,
        supabase
      })
      setBets(loadedBets)
      return loadedBets
    } catch (error) {
      console.error('LOAD_BETS: Error loading bets:', error)
      return []
    }
  }

  // Save encrypted data to Supabase (for backwards compatibility with savedSetups)
  const saveEncryptedData = async (betsToSave = null, setupsToSave = null) => {
    const betsData = betsToSave !== null ? betsToSave : bets
    const setupsData = setupsToSave !== null ? setupsToSave : savedSetups
    
    const result = await saveBets(betsData, {
      currentProfile,
      currentPin,
      currentSalt,
      supabase,
      savedSetups: setupsData
    })
    
    return result
  }

  const handleLock = async () => {
    await saveEncryptedData()
    setIsLocked(true)
    setCurrentPin(null)
    setCurrentSalt(null)
  }

  const handleSwitchUser = async () => {
    await saveEncryptedData()
    await supabase.auth.signOut()
    setIsLocked(true)
    setCurrentProfile(null)
    setCurrentPin(null)
    setCurrentSalt(null)
    setBets([])
    setSavedSetups([])
  }

  // Save encrypted data when bets or savedSetups change
  useEffect(() => {
    if (currentProfile && currentPin && currentSalt) {
      const timeoutId = setTimeout(() => {
        saveEncryptedData()
      }, 500)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bets, savedSetups, currentProfile, currentPin, currentSalt])

  // Calculate arb stakes
  const calculateArb = () => {
    const decimalA = parseOdds(oddsA)
    const decimalB = parseOdds(oddsB)
    const stake = parseFloat(totalStake)

    // Return null only if we can't parse the inputs
    if (!decimalA || !decimalB) {
      return { error: 'Please enter valid odds for both sides' }
    }

    if (!stake || stake <= 0) {
      return { error: 'Please enter a valid total stake greater than 0' }
    }

    const probA = oddsToImpliedProb(decimalA, 'decimal')
    const probB = oddsToImpliedProb(decimalB, 'decimal')
    const impliedSum = probA + probB
    const overround = (impliedSum - 1) * 100

    if (impliedSum >= 1) {
      return { 
        arb: false, 
        impliedSum, 
        decimalA, 
        decimalB, 
        probA, 
        probB,
        overround
      }
    }

    // Calculate stakes to equalize payout
    const stakeA = (stake * probA) / impliedSum
    const stakeB = (stake * probB) / impliedSum

    // Round stakes
    const roundedA = Math.round(stakeA / rounding) * rounding
    const roundedB = Math.round(stakeB / rounding) * rounding

    const payoutA = roundedA * decimalA
    const payoutB = roundedB * decimalB
    const totalRounded = roundedA + roundedB
    const worstPayout = Math.min(payoutA, payoutB)
    const worstProfit = worstPayout - totalRounded
    const worstProfitPercent = (worstProfit / totalRounded) * 100

    const originalProfit = (stake / impliedSum) - stake
    const originalProfitPercent = (originalProfit / stake) * 100

    return {
      arb: true,
      impliedSum,
      decimalA,
      decimalB,
      probA,
      probB,
      stakeA,
      stakeB,
      roundedA,
      roundedB,
      payoutA,
      payoutB,
      totalRounded,
      worstProfit,
      worstProfitPercent,
      originalProfit,
      originalProfitPercent
    }
  }

  const arbResult = calculateArb()

  // Format American odds for display
  const formatAmerican = (decimal) => {
    if (!decimal) return ''
    if (decimal >= 2) {
      return `+${Math.round((decimal - 1) * 100)}`
    } else {
      return `-${Math.round(100 / (decimal - 1))}`
    }
  }

  // Save setup
  const handleSave = () => {
    if (!arbResult || !arbResult.arb) return

    const setup = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      oddsA,
      oddsB,
      totalStake: parseFloat(totalStake),
      decimalA: arbResult.decimalA,
      decimalB: arbResult.decimalB,
      stakeA: arbResult.roundedA,
      stakeB: arbResult.roundedB,
      profit: arbResult.worstProfit,
      profitPercent: arbResult.worstProfitPercent
    }

    const updated = [setup, ...savedSetups].slice(0, 20)
    setSavedSetups(updated)
    localStorage.setItem('edgeLabSaved', JSON.stringify(updated))
  }

  // Copy share text
  const handleCopyShare = () => {
    if (!arbResult || !arbResult.arb) return

    const text = `EDGE LAB — Arb Check:
A: ${formatAmerican(arbResult.decimalA)} (${arbResult.decimalA.toFixed(4)}), B: ${formatAmerican(arbResult.decimalB)} (${arbResult.decimalB.toFixed(4)})
Bankroll: $${parseFloat(totalStake).toFixed(2)}
Stakes: $${arbResult.roundedA.toFixed(2)} / $${arbResult.roundedB.toFixed(2)}
Profit: $${arbResult.worstProfit.toFixed(2)} (${arbResult.worstProfitPercent.toFixed(2)}%)`

    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!')
    })
  }

  // Delete saved setup
  const handleDelete = (id) => {
    const updated = savedSetups.filter(s => s.id !== id)
    setSavedSetups(updated)
    localStorage.setItem('edgeLabSaved', JSON.stringify(updated))
  }

  // Load saved setup
  const handleLoad = (setup) => {
    setOddsA(setup.oddsA)
    setOddsB(setup.oddsB)
    setTotalStake(setup.totalStake.toString())
    setActiveTab('arb')
  }

  const getDefaultOddsValue = (format) => {
    if (format === 'decimal') return '1.91'
    if (format === 'fractional') return '10/11'
    return '-110'
  }

  // Update leg odds + formats when leg count changes
  useEffect(() => {
    setLegOdds(prev => {
      if (prev.length === legCount) return prev

      if (prev.length < legCount) {
        const fallback = prev[prev.length - 1] || getDefaultOddsValue('american')
        return [...prev, ...Array(legCount - prev.length).fill(fallback)]
      }
      return prev.slice(0, legCount)
    })

    setLegOddsFormats(prev => {
      if (prev.length === legCount) return prev
      if (prev.length < legCount) {
        const fallback = prev[prev.length - 1] || 'american'
        return [...prev, ...Array(legCount - prev.length).fill(fallback)]
      }
      return prev.slice(0, legCount)
    })
  }, [legCount])

  useEffect(() => {
    setParlayLegs(prev => {
      if (prev.length === parlayLegCount) return prev
      if (prev.length < parlayLegCount) {
        const fallback = prev[prev.length - 1] || { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' }
        return [...prev, ...Array(parlayLegCount - prev.length).fill(null).map(() => ({ ...fallback }))]
      }
      return prev.slice(0, parlayLegCount)
    })
  }, [parlayLegCount])

  const updateParlayLeg = (index, patch) => {
    setParlayLegs(prev => prev.map((leg, legIndex) => (
      legIndex === index ? { ...leg, ...patch } : leg
    )))
  }

  const calculateParlayImpliedProb = (legs) => {
    if (!legs.length) return null
    const legProbs = legs.map(leg => oddsToImpliedProb(leg.oddsText, leg.oddsFormat)).filter(Boolean)
    if (legProbs.length !== legs.length) return null
    return legProbs.reduce((prod, p) => prod * p, 1)
  }

  // Update leg odds at index
  const updateLegOdds = (index, value) => {
    const newOdds = [...legOdds]
    newOdds[index] = value
    setLegOdds(newOdds)
  }

  const updateLegOddsFormat = (index, value) => {
    const newFormats = [...legOddsFormats]
    newFormats[index] = value
    setLegOddsFormats(newFormats)
  }

  const getImpliedPercent = (oddsText, format) => {
    const prob = oddsToImpliedProb(oddsText, format)
    return prob ? impliedProbToPercent(prob) : null
  }

  const buildShopOddsRows = () => {
    return legOdds.slice(0, legCount).map((oddsText, index) => {
      const oddsFormat = legOddsFormats[index] || 'american'
      const impliedProb = oddsToImpliedProb(oddsText, oddsFormat)
      const bestOdds = getBestOddsForLeg({ index, oddsText, oddsFormat })
      const bestProb = bestOdds ? oddsToImpliedProb(bestOdds.oddsText, bestOdds.oddsFormat) : null
      const delta = (impliedProb && bestProb) ? impliedProb - bestProb : null
      return {
        index,
        oddsText,
        oddsFormat,
        impliedProb,
        bestOdds,
        bestProb,
        delta
      }
    })
  }

  // Poisson Binomial Distribution - Calculate probability of exactly k successes
  // Uses dynamic programming: O(n*k) where n = number of legs, k = successes
  const poissonBinomialExactly = (probs, k) => {
    const n = probs.length
    if (k < 0 || k > n) return 0
    
    // dp[i][j] = probability of exactly j successes in first i trials
    const dp = Array(n + 1).fill(null).map(() => Array(k + 1).fill(0))
    dp[0][0] = 1
    
    for (let i = 1; i <= n; i++) {
      const p = probs[i - 1] / 100
      dp[i][0] = dp[i - 1][0] * (1 - p)
      for (let j = 1; j <= Math.min(i, k); j++) {
        dp[i][j] = dp[i - 1][j] * (1 - p) + dp[i - 1][j - 1] * p
      }
    }
    
    return dp[n][k]
  }

  // Probability of at least k successes
  const poissonBinomialAtLeast = (probs, k) => {
    let sum = 0
    for (let i = k; i <= probs.length; i++) {
      sum += poissonBinomialExactly(probs, i)
    }
    return sum
  }

  // Calculate reality check results
  const calculateReality = () => {
    const legItems = legOdds.slice(0, legCount).map((oddsText, index) => {
      const oddsFormat = legOddsFormats[index] || 'american'
      const impliedProb = oddsToImpliedProb(oddsText, oddsFormat)
      const bestOdds = getBestOddsForLeg({ index, oddsText, oddsFormat })
      const bestProb = bestOdds ? oddsToImpliedProb(bestOdds.oddsText, bestOdds.oddsFormat) : null
      return {
        index,
        oddsText,
        oddsFormat,
        impliedProb,
        bestOdds,
        bestProb
      }
    })

    const hasAllLegs = legItems.every(item => item.impliedProb > 0 && item.impliedProb < 1)
    if (!hasAllLegs) return null

    const validProbs = legItems.map(item => item.impliedProb * 100)
    const probabilities = legItems.map(item => item.impliedProb)

    // Straight parlay: all legs hit
    const allHitProb = probabilities.reduce((prod, p) => prod * p, 1)

    // Calculate probabilities for each outcome
    const outcomes = []
    for (let k = 0; k <= validProbs.length; k++) {
      const exactlyK = poissonBinomialExactly(validProbs, k)
      const atLeastK = k === 0 ? 1 : poissonBinomialAtLeast(validProbs, k)

      outcomes.push({
        k,
        exactly: exactlyK,
        atLeast: atLeastK,
        exactlyPercent: exactlyK * 100,
        atLeastPercent: atLeastK * 100
      })
    }

    // Find weakest leg (lowest probability)
    const weakestItem = legItems.reduce((min, item) => (
      item.impliedProb < min.impliedProb ? item : min
    ), legItems[0])
    const weakestIndex = weakestItem.index

    const P = probabilities.reduce((prod, p) => prod * p, 1)
    const n = probabilities.length
    const L = -Math.log(P)
    const L2 = L * (1 + 0.08 * (n - 1))
    const difficulty = clampNumber(Math.round(99 * (1 - Math.exp(-L2 / 3.0))), 0, 99)

    const priceScores = legItems
      .filter(item => item.bestProb)
      .map(item => {
        const delta = Math.max(0, item.impliedProb - item.bestProb)
        return clampNumber(Math.round(99 * Math.exp(-delta / 0.02)), 0, 99)
      })
    const priceQuality = priceScores.length
      ? Math.round(priceScores.reduce((sum, score) => sum + score, 0) / priceScores.length)
      : null

    return {
      allHitProb,
      allHitPercent: allHitProb * 100,
      outcomes,
      weakestIndex,
      weakestProb: weakestItem.impliedProb * 100,
      legProbabilities: validProbs,
      difficultyScore: difficulty,
      priceQualityScore: priceQuality,
      priceQualityAvailable: priceScores.length > 0
    }
  }

  const realityResult = calculateReality()

  // Journal helper functions
  const calculateBetProfit = (bet) => {
    // Use stored profit if available (for saved bets)
    if (bet.profit !== undefined) {
      return bet.profit
    }

    if (bet.betType === 'parlay') {
      const stake = bet.stake || 0
      if (bet.result === 'Win' && bet.payout !== undefined) {
        return bet.payout - stake
      }
      if (bet.result === 'Loss') {
        return -stake
      }
      return 0
    }
    
    // Otherwise calculate (for backwards compatibility)
    const decimalOdds = getDecimalOddsForBet(bet)
    if (!decimalOdds) return 0
    
    if (bet.result === 'Win') {
      return bet.stake * (decimalOdds - 1)
    } else if (bet.result === 'Loss') {
      return -bet.stake
    } else {
      return 0 // Push
    }
  }

  const getDecimalOddsForBet = (bet) => {
    if (bet.decimalOdds) return bet.decimalOdds
    if (bet.betType === 'parlay') {
      if (bet.impliedProb) return 1 / bet.impliedProb
      return null
    }
    return parseOdds(bet.odds, bet.oddsFormat)
  }

  const getOddsRange = (decimalOdds) => {
    const american = decimalToAmerican(decimalOdds)
    if (american <= -200) return '(-200 to -151)'
    if (american <= -151) return '(-200 to -151)'
    if (american <= -101) return '(-150 to -101)'
    if (american <= 100) return '(-100 to +100)'
    if (american <= 200) return '(+101 to +200)'
    return '(+201+)'
  }

  const decimalToAmerican = (decimal) => {
    if (decimal >= 2) {
      return Math.round((decimal - 1) * 100)
    } else {
      return Math.round(-100 / (decimal - 1))
    }
  }

  const getTimeOfDay = (dateString) => {
    const date = new Date(dateString)
    const hour = date.getHours()
    if (hour >= 6 && hour < 12) return 'Morning'
    if (hour >= 12 && hour < 17) return 'Afternoon'
    if (hour >= 17 && hour < 22) return 'Evening'
    return 'Late Night'
  }

  const getConfidenceBucket = (confidence) => {
    if (confidence <= 3) return '1-3'
    if (confidence <= 6) return '4-6'
    if (confidence <= 8) return '7-8'
    return '9-10'
  }

  // Calculate analytics
  const calculateAnalytics = () => {
    // Use only synced bets for analytics (not queued/pending)
    if (bets.length === 0) return null

    const filteredBets = bets.filter(bet => {
      const decimalOdds = getDecimalOddsForBet(bet)
      const american = decimalOdds ? decimalToAmerican(decimalOdds) : 0
      
      if (filters.sport && bet.sport.toLowerCase() !== filters.sport.toLowerCase()) return false
      if (filters.marketType && bet.marketType !== filters.marketType) return false
      if (filters.book && bet.book !== filters.book) return false
      if (filters.result && bet.result !== filters.result) return false
      if (filters.oddsMin && american < parseFloat(filters.oddsMin)) return false
      if (filters.oddsMax && american > parseFloat(filters.oddsMax)) return false
      if (filters.dateFrom && bet.date < filters.dateFrom) return false
      if (filters.dateTo && bet.date > filters.dateTo) return false
      return true
    })

    // Overall stats
    const totalBets = filteredBets.length
    const wins = filteredBets.filter(b => b.result === 'Win').length
    const losses = filteredBets.filter(b => b.result === 'Loss').length
    const pushes = filteredBets.filter(b => b.result === 'Push').length
    const winRate = totalBets > 0 ? (wins / totalBets) * 100 : 0
    const totalRisked = filteredBets.reduce((sum, b) => sum + b.stake, 0)
    const profit = filteredBets.reduce((sum, b) => sum + calculateBetProfit(b), 0)
    const roi = totalRisked > 0 ? (profit / totalRisked) * 100 : 0
    const avgOdds = filteredBets.reduce((sum, b) => {
      const dec = getDecimalOddsForBet(b)
      return sum + (dec || 0)
    }, 0) / totalBets

    // Breakdown by sport
    const bySport = {}
    filteredBets.forEach(bet => {
      if (!bySport[bet.sport]) {
        bySport[bet.sport] = { bets: [], sport: bet.sport }
      }
      bySport[bet.sport].bets.push(bet)
    })
    const sportBreakdown = Object.values(bySport).map(group => {
      const groupBets = group.bets
      const groupWins = groupBets.filter(b => b.result === 'Win').length
      const groupUnits = groupBets.reduce((sum, b) => sum + b.stake, 0)
      const groupProfit = groupBets.reduce((sum, b) => sum + calculateBetProfit(b), 0)
      return {
        sport: group.sport,
        bets: groupBets.length,
        winRate: groupBets.length > 0 ? (groupWins / groupBets.length) * 100 : 0,
        roi: groupUnits > 0 ? (groupProfit / groupUnits) * 100 : 0,
        profit: groupProfit
      }
    }).sort((a, b) => (b.profit || b.profitUnits || 0) - (a.profit || a.profitUnits || 0))

    // Breakdown by market type
    const byMarket = {}
    filteredBets.forEach(bet => {
      if (!byMarket[bet.marketType]) {
        byMarket[bet.marketType] = { bets: [], marketType: bet.marketType }
      }
      byMarket[bet.marketType].bets.push(bet)
    })
    const marketBreakdown = Object.values(byMarket).map(group => {
      const groupBets = group.bets
      const groupWins = groupBets.filter(b => b.result === 'Win').length
      const groupUnits = groupBets.reduce((sum, b) => sum + b.stake, 0)
      const groupProfit = groupBets.reduce((sum, b) => sum + calculateBetProfit(b), 0)
      return {
        marketType: group.marketType,
        bets: groupBets.length,
        winRate: groupBets.length > 0 ? (groupWins / groupBets.length) * 100 : 0,
        roi: groupUnits > 0 ? (groupProfit / groupUnits) * 100 : 0,
        profit: groupProfit
      }
    }).sort((a, b) => (b.profit || b.profitUnits || 0) - (a.profit || a.profitUnits || 0))

    // Breakdown by book/app
    const byBook = {}
    filteredBets.forEach(bet => {
      const book = bet.book || bet.book_app || bet.bookApp || bet.bookUsed || 'Unknown'
      if (!byBook[book]) {
        byBook[book] = { bets: [], book: book }
      }
      byBook[book].bets.push(bet)
    })
    const bookBreakdown = Object.values(byBook).map(group => {
      const groupBets = group.bets
      const groupWins = groupBets.filter(b => b.result === 'Win').length
      const groupUnits = groupBets.reduce((sum, b) => sum + b.stake, 0)
      const groupProfit = groupBets.reduce((sum, b) => sum + calculateBetProfit(b), 0)
      return {
        book: group.book,
        bets: groupBets.length,
        winRate: groupBets.length > 0 ? (groupWins / groupBets.length) * 100 : 0,
        roi: groupUnits > 0 ? (groupProfit / groupUnits) * 100 : 0,
        profit: groupProfit
      }
    }).sort((a, b) => (b.profit || b.profitUnits || 0) - (a.profit || a.profitUnits || 0))

    // Breakdown by odds range
    const byOddsRange = {}
    filteredBets.forEach(bet => {
      const decimalOdds = getDecimalOddsForBet(bet)
      if (!decimalOdds) return
      const range = getOddsRange(decimalOdds)
      if (!byOddsRange[range]) {
        byOddsRange[range] = { bets: [], range }
      }
      byOddsRange[range].bets.push(bet)
    })
    const oddsBreakdown = Object.values(byOddsRange).map(group => {
      const groupBets = group.bets
      const groupWins = groupBets.filter(b => b.result === 'Win').length
      const groupUnits = groupBets.reduce((sum, b) => sum + b.stake, 0)
      const groupProfit = groupBets.reduce((sum, b) => sum + calculateBetProfit(b), 0)
      return {
        range: group.range,
        bets: groupBets.length,
        winRate: groupBets.length > 0 ? (groupWins / groupBets.length) * 100 : 0,
        roi: groupUnits > 0 ? (groupProfit / groupUnits) * 100 : 0,
        profit: groupProfit
      }
    }).sort((a, b) => {
      // Sort by odds range order
      const order = ['(-200 to -151)', '(-150 to -101)', '(-100 to +100)', '(+101 to +200)', '(+201+)']
      return order.indexOf(a.range) - order.indexOf(b.range)
    })

    // Breakdown by confidence
    const byConfidence = {}
    filteredBets.forEach(bet => {
      const bucket = getConfidenceBucket(bet.confidence)
      if (!byConfidence[bucket]) {
        byConfidence[bucket] = { bets: [], bucket }
      }
      byConfidence[bucket].bets.push(bet)
    })
    const confidenceBreakdown = Object.values(byConfidence).map(group => {
      const groupBets = group.bets
      const groupWins = groupBets.filter(b => b.result === 'Win').length
      const groupUnits = groupBets.reduce((sum, b) => sum + b.stake, 0)
      const groupProfit = groupBets.reduce((sum, b) => sum + calculateBetProfit(b), 0)
      return {
        bucket: group.bucket,
        bets: groupBets.length,
        winRate: groupBets.length > 0 ? (groupWins / groupBets.length) * 100 : 0,
        roi: groupUnits > 0 ? (groupProfit / groupUnits) * 100 : 0,
        profit: groupProfit
      }
    }).sort((a, b) => parseInt(a.bucket.split('-')[0]) - parseInt(b.bucket.split('-')[0]))

    // Breakdown by time of day
    const byTime = {}
    filteredBets.forEach(bet => {
      const timeOfDay = getTimeOfDay(bet.date)
      if (!byTime[timeOfDay]) {
        byTime[timeOfDay] = { bets: [], timeOfDay }
      }
      byTime[timeOfDay].bets.push(bet)
    })
    const timeBreakdown = Object.values(byTime).map(group => {
      const groupBets = group.bets
      const groupWins = groupBets.filter(b => b.result === 'Win').length
      const groupUnits = groupBets.reduce((sum, b) => sum + b.stake, 0)
      const groupProfit = groupBets.reduce((sum, b) => sum + calculateBetProfit(b), 0)
      return {
        timeOfDay: group.timeOfDay,
        bets: groupBets.length,
        winRate: groupBets.length > 0 ? (groupWins / groupBets.length) * 100 : 0,
        roi: groupUnits > 0 ? (groupProfit / groupUnits) * 100 : 0,
        profit: groupProfit
      }
    }).sort((a, b) => {
      const order = ['Morning', 'Afternoon', 'Evening', 'Late Night']
      return order.indexOf(a.timeOfDay) - order.indexOf(b.timeOfDay)
    })

    // Avoid List (bottom 3 by ROI with at least 10 bets)
    const avoidList = [...sportBreakdown, ...marketBreakdown, ...bookBreakdown]
      .filter(cat => cat.bets >= 10)
      .sort((a, b) => a.roi - b.roi)
      .slice(0, 3)

    // Strengths (top 3 by ROI with at least 10 bets)
    const strengths = [...sportBreakdown, ...marketBreakdown, ...bookBreakdown]
      .filter(cat => cat.bets >= 10)
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 3)

    return {
      overall: {
        totalBets,
        wins,
        losses,
        pushes,
        winRate,
        totalRisked,
        profit,
        roi,
        avgOdds
      },
      bySport: sportBreakdown,
      byMarket: marketBreakdown,
      byBook: bookBreakdown,
      byOddsRange: oddsBreakdown,
      byConfidence: confidenceBreakdown,
      byTime: timeBreakdown,
      avoidList,
      strengths,
      filteredBets
    }
  }

  const analytics = calculateAnalytics()

  // Sync queued bets to Supabase (background sync)
  // CRITICAL: This function must NEVER throw - wrap all errors
  const trySyncQueue = async () => {
    try {
      // Check if sync conditions are met
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user || !currentPin || !currentSalt || !currentProfile) {
        console.log('trySyncQueue: Conditions not met, skipping sync')
        return
      }

      const pending = getQueuedBets().filter(q => q.status === 'pending')
      if (pending.length === 0) {
        return
      }

      setSyncing(true)
      console.log('trySyncQueue: Syncing', pending.length, 'pending bets')

      for (const queuedItem of pending) {
        try {
          // Use canonical store to add bet
          const profileForStore = {
            id: session.user.id,
            username: currentProfile.username,
            email: currentProfile.email
          }
          
          const updatedBets = await addBet(queuedItem.bet, bets, {
            currentProfile: profileForStore,
            currentPin,
            currentSalt,
            supabase,
            savedSetups
          })
          
          // Mark as synced and remove from queue
          markBetSynced(queuedItem.id)
          
          // Update local bets state
          setBets(updatedBets)
          
          // Update queued bets state
          const updatedQueued = getQueuedBetData()
          setQueuedBets(updatedQueued)
          
          console.log('trySyncQueue: Bet synced', queuedItem.id)
        } catch (error) {
          console.error('trySyncQueue: Failed to sync bet', queuedItem.id, error)
          // Keep bet in queue for retry
          // Do NOT throw - continue with next bet
        }
      }
    } catch (error) {
      console.error('trySyncQueue: Fatal error', error)
      // Never throw - just log and continue
    } finally {
      // Always reset syncing state
      setSyncing(false)
    }
  }

  // Retry sync manually
  const handleRetrySync = async () => {
    await trySyncQueue()
  }

  // Unlock handler (when PIN/salt missing but session valid)
  const handleUnlock = async () => {
    setUnlockError('')
    
    if (!unlockPin || unlockPin.length !== 4) {
      setUnlockError('Please enter a 4-digit PIN')
      return
    }

    try {
      // Get logged-in user (NEVER use input email)
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setUnlockError('Session expired. Please log in again.')
        return
      }

      // Get user profile to verify PIN
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('pin_hash, salt, username')
        .eq('user_id', user.id)
        .single()

      if (profileError || !profile) {
        setUnlockError('Profile not found. Please log in again.')
        return
      }

      // Normalize PIN using SAME recipe as signup (from Auth.jsx)
      const normalizePin = (pin) => {
        const trimmed = String(pin).trim()
        return trimmed.padStart(4, '0').slice(0, 4)
      }
      const normalizedPin = normalizePin(unlockPin)

      if (!/^\d{4}$/.test(normalizedPin)) {
        setUnlockError('PIN must be exactly 4 digits')
        return
      }

      // Use EXACT username as stored in profile (already lowercase from ensureProfile)
      // Don't re-normalize - use profile.username exactly as stored when pin_hash was created
      const usernameForHash = profile.username

      // Debug logs for verification mismatch
      console.log('UNLOCK: Normalized PIN', normalizedPin)
      console.log('UNLOCK: Username from profile (exact)', usernameForHash)
      console.log('UNLOCK: User email', user.email?.trim().toLowerCase())
      console.log('UNLOCK: Salt exists', !!profile.salt)
      console.log('UNLOCK: Salt type', Array.isArray(profile.salt) ? 'array' : typeof profile.salt)
      console.log('UNLOCK: pin_hash exists', !!profile.pin_hash)
      console.log('UNLOCK: pin_hash length', profile.pin_hash?.length)

      // Verify PIN using EXACT same recipe as reset PIN (line 439 in Auth.jsx)
      const { hashPIN } = await import('./utils/crypto')
      const salt = new Uint8Array(profile.salt)
      
      // Use same hashPIN function: pin + username + salt array joined (exactly as reset PIN)
      // hashPIN does: encoder.encode(pin + username + Array.from(salt).join(''))
      const computedHash = await hashPIN(normalizedPin, usernameForHash, salt)
      const isValid = computedHash === profile.pin_hash

      console.log('UNLOCK: Hash match', isValid)
      console.log('UNLOCK: Computed hash', computedHash.substring(0, 16) + '...')
      console.log('UNLOCK: Stored hash', profile.pin_hash?.substring(0, 16) + '...')

      if (!isValid) {
        setUnlockError('Incorrect PIN. Please try again.')
        return
      }

      // Set PIN and salt in memory
      setCurrentPin(normalizedPin)
      setCurrentSalt(Array.from(salt))
      setUnlockPin('')
      setUnlockError('')
      
      // PERSISTENCE: Load bets after unlock
      const profileForLoad = {
        id: user.id,
        username: profile.username,
        email: user.email
      }
      
      try {
        const loadedBets = await loadBets({
          currentProfile: profileForLoad,
          currentPin: normalizedPin,
          currentSalt: Array.from(salt),
          supabase
        })
        setBets(loadedBets)
        console.log('PERSIST: loaded bets', loadedBets.length)
      } catch (loadError) {
        console.error('PERSIST: Failed to load bets after unlock', loadError)
        // Don't show error to user - just log it
      }
    } catch (error) {
      console.error('Unlock failed:', error)
      setUnlockError('Unlock failed. Please try again.')
    }
  }

  // Journal handlers
  const handleBetSubmit = async (e) => {
    // EMERGENCY FIX: CRITICAL - Prevent form submission/page reload/navigation
    if (e) {
      e.preventDefault()
      e.stopPropagation()
      // Prevent default behavior completely
      if (e.nativeEvent) {
        e.nativeEvent.preventDefault()
        e.nativeEvent.stopPropagation()
      }
    }
    
    // EMERGENCY FIX: Never allow navigation/reload
    // Return early if this somehow gets called during navigation
    if (!e || typeof e.preventDefault !== 'function') {
      console.error('ADD_BET: Invalid event, aborting')
      return
    }

    try {
      // DIAGNOSTIC: Log BEFORE any auth checks
      console.log('ADD_BET: clicked')
      console.log('ADD_BET: supabase url', import.meta.env.VITE_SUPABASE_URL)
      console.log('ADD_BET: has anon key', !!import.meta.env.VITE_SUPABASE_ANON_KEY)
      
      // Immediately fetch BOTH session and user
      const { data: sessionData, error: getSessionError } = await supabase.auth.getSession()
      console.log('ADD_BET: getSession()', {
        userId: sessionData?.session?.user?.id,
        session: sessionData?.session,
        error: getSessionError
      })
      
      const { data: userData, error: getUserError } = await supabase.auth.getUser()
      console.log('ADD_BET: getUser()', {
        userId: userData?.user?.id,
        user: userData?.user,
        error: getUserError
      })
      
      console.log('ADD_BET clicked: authReady=', authReady)
      console.log('ADD_BET: currentProfile', currentProfile)
      console.log('ADD_BET: currentPin exists', !!currentPin)
      console.log('ADD_BET: currentSalt exists', !!currentSalt)
      
      // Clear any previous messages
      setBetFormMessage({ type: null, text: '' })

      const isParlay = betForm.betType === 'parlay'
      const stake = parseFloat(betForm.stake)

      if (!betForm.sport || !betForm.book || betForm.book.trim() === '' || !betForm.date) {
        setBetFormMessage({ type: 'error', text: 'Please fill in all required fields (including Book/App)' })
        return
      }

      if (!stake || stake <= 0) {
        setBetFormMessage({ type: 'error', text: 'Please enter a valid stake' })
        return
      }

      let betPayload = null

      if (isParlay) {
        if (parlayLegs.length < 2) {
          setBetFormMessage({ type: 'error', text: 'Parlays require at least 2 legs.' })
          return
        }

        const parlayImplied = calculateParlayImpliedProb(parlayLegs)
        if (!parlayImplied) {
          setBetFormMessage({ type: 'error', text: 'Enter valid odds for all legs.' })
          return
        }

        const payout = parseFloat(betForm.payout)
        if (!payout || payout <= 0) {
          setBetFormMessage({ type: 'error', text: 'Please enter the payout for this parlay.' })
          return
        }

        let profit = 0
        if (betForm.result === 'Win') {
          profit = payout - stake
        } else if (betForm.result === 'Loss') {
          profit = -stake
        } else {
          profit = 0
        }

        const decimalOdds = parlayImplied > 0 ? 1 / parlayImplied : null
        const oddsText = decimalOdds ? decimalOdds.toFixed(2) : ''

        betPayload = {
          date: betForm.date,
          sport: betForm.sport,
          marketType: 'Parlay',
          book: betForm.book,
          odds: oddsText,
          oddsFormat: 'decimal',
          stake: stake,
          payout: payout,
          result: betForm.result,
          confidence: betForm.confidence,
          notes: betForm.notes || '',
          betType: 'parlay',
          decimalOdds: decimalOdds,
          impliedProb: parlayImplied,
          profit: profit,
          legs: parlayLegs.map((leg, idx) => ({
            legIndex: idx,
            market: leg.market,
            selection: leg.selection,
            line: leg.line,
            oddsText: leg.oddsText,
            oddsFormat: leg.oddsFormat,
            impliedProb: oddsToImpliedProb(leg.oddsText, leg.oddsFormat),
            legResult: leg.legResult
          })),
          timestamp: new Date(betForm.date).toISOString()
        }
      } else {
        const decimalOdds = parseOdds(betForm.odds, betForm.oddsFormat)
        if (!decimalOdds) {
          setBetFormMessage({ type: 'error', text: 'Please enter valid odds.' })
          return
        }

        const impliedProb = 1 / decimalOdds
        let profit = 0
        if (betForm.result === 'Win') {
          profit = stake * (decimalOdds - 1)
        } else if (betForm.result === 'Loss') {
          profit = -stake
        } else {
          profit = 0 // Push
        }

        betPayload = {
          date: betForm.date,
          sport: betForm.sport,
          marketType: betForm.marketType,
          book: betForm.book,
          odds: betForm.odds,
          oddsFormat: betForm.oddsFormat,
          stake: stake,
          result: betForm.result,
          confidence: betForm.confidence,
          notes: betForm.notes || '',
          betType: 'straight',
          decimalOdds: decimalOdds,
          impliedProb: impliedProb,
          profit: profit,
          timestamp: new Date(betForm.date).toISOString()
        }
      }

      if (editingBet) {
        betPayload.id = editingBet.id
      }

      console.log('ADD_BET payload', betPayload)

      // Use the session we already fetched above
      const freshSession = sessionData?.session
      console.log('ADD_BET click: authReady=', authReady)
      console.log('ADD_BET click: session user=', freshSession?.user?.id)

      // Check if session is valid
      if (!freshSession || !freshSession.user || !freshSession.user.id) {
        console.error('ADD_BET: Session expired or missing')
        setBetFormMessage({ type: 'error', text: 'Session expired. Please log in again.' })
        // Do NOT sign out here - it can cause navigation/white screen
        // Just show error and let user handle it
        return
      }

      // LOCAL-FIRST: Always enqueue bet locally first (immediate save)
      if (editingBet) {
        // Editing: update in queue if queued, else update in synced bets
        const queuedItem = getQueuedBets().find(q => q.id === editingBet.id)
        if (queuedItem) {
          // Update in queue
          updateQueuedBet(editingBet.id, betPayload)
          const updatedQueued = getQueuedBetData()
          setQueuedBets(updatedQueued)
          setEditingBet(null)
          setBetFormMessage({ type: 'success', text: 'Bet updated ✅' })
        } else {
          // Update synced bet (requires auth)
          if (!currentPin || !currentSalt || !currentProfile) {
            setBetFormMessage({ type: 'error', text: 'Unlock required to update synced bet.' })
            return
          }
          
          if (currentProfile.id !== freshSession.user.id) {
            setBetFormMessage({ type: 'error', text: 'Session expired. Please log in again.' })
            // Do NOT sign out here - it can cause navigation/white screen
            return
          }
          
          try {
          
          const profileForStore = {
            id: freshSession.user.id,
            username: currentProfile.username,
            email: currentProfile.email
          }
          
            const updatedBets = await updateBet(editingBet.id, betPayload, bets, {
              currentProfile: profileForStore,
              currentPin,
              currentSalt,
              supabase,
              savedSetups
            })
            setBets(updatedBets)
            setEditingBet(null)
            setBetFormMessage({ type: 'success', text: 'Bet updated ✅' })
          } catch (updateError) {
            console.error('ADD_BET: Failed to update synced bet', updateError)
            setBetFormMessage({ type: 'error', text: 'Failed to update bet. Please try again.' })
            return
          }
        }
      } else {
        // New bet: always enqueue locally first (immediate save, sync later)
        try {
          const queuedBet = enqueueBet(betPayload)
          const updatedQueued = getQueuedBetData()
          setQueuedBets(updatedQueued)
          
          // PERSISTENCE: If auth is available, save immediately to Supabase
          if (currentPin && currentSalt && currentProfile && freshSession.user.id === currentProfile.id) {
            try {
              const allBetsToSave = [...bets, betPayload]
              const saveResult = await saveBets(allBetsToSave, {
                currentProfile: {
                  id: freshSession.user.id,
                  username: currentProfile.username,
                  email: currentProfile.email
                },
                currentPin,
                currentSalt,
                supabase,
                savedSetups
              })
              
              if (saveResult.error) {
                console.error('PERSIST: Failed to save bet', saveResult.error)
                // Still show success - bet is saved locally in queue
              } else {
                // Update state with synced bet
                setBets(allBetsToSave)
                console.log('PERSIST: saved bets', allBetsToSave.length)
              }
            } catch (saveError) {
              console.error('PERSIST: Error saving bet', saveError)
              // Don't show error - bet is saved locally
            }
          }
          
          setBetFormMessage({ type: 'success', text: 'Bet saved ✅' })
          
          // Also attempt background sync for queue (non-blocking)
          if (currentPin && currentSalt && currentProfile && freshSession.user.id === currentProfile.id) {
            trySyncQueue().catch(err => {
              console.error('SYNC_FAIL: Background sync failed', err)
            }).finally(() => {
              setSyncing(false)
            })
          }
        } catch (enqueueError) {
          console.error('ADD_BET: Failed to enqueue bet', enqueueError)
          setBetFormMessage({ type: 'error', text: 'Failed to save bet locally. Please try again.' })
          return // Exit early on enqueue failure
        }
      }
      
      console.log('ADD_BET result: Bet saved locally', { queuedCount: getQueuedBetData().length })
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setBetFormMessage({ type: null, text: '' })
      }, 3000)
      
      // Clear form
      setBetForm({
        date: new Date().toISOString().slice(0, 16),
        sport: '',
        marketType: 'ML',
        book: '',
        odds: '',
        oddsFormat: 'american',
        stake: '',
        result: 'Win',
        payout: '',
        confidence: 5,
        notes: '',
        betType: 'straight'
      })
      setParlayLegCount(2)
      setParlayLegs([
        { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' },
        { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' }
      ])
    } catch (error) {
      console.error('ADD_BET failed', error)
      // ALWAYS show visible error message (never silent) - prevent crash
      const errorMessage = error?.message || 'Failed to save bet. Please try again.'
      setBetFormMessage({ type: 'error', text: `Error: ${errorMessage}` })
      // Return safely - don't let error escape
      // CRITICAL: Never throw from this handler - always return
      return
    } finally {
      // Ensure we always clear form/reset state even on error
      // This prevents UI from getting stuck
      console.log('ADD_BET: Handler completed (success or error)')
    }
  }

  const handleEditBet = (bet) => {
    setEditingBet(bet)
    const isParlay = bet.betType === 'parlay'
    setBetForm({
      date: bet.date.slice(0, 16),
      sport: bet.sport,
      marketType: bet.marketType || 'ML',
      book: bet.book || '',
      odds: bet.odds || '',
      oddsFormat: bet.oddsFormat || 'american',
      stake: bet.stake?.toString() || '',
      result: bet.result || 'Win',
      payout: bet.payout?.toString() || '',
      confidence: bet.confidence || 5,
      notes: bet.notes || '',
      betType: isParlay ? 'parlay' : 'straight'
    })

    if (isParlay) {
      const legs = Array.isArray(bet.legs) ? bet.legs : []
      const normalizedLegs = legs.map((leg) => ({
        market: leg.market || '',
        selection: leg.selection || '',
        line: leg.line || '',
        oddsText: leg.oddsText || '',
        oddsFormat: leg.oddsFormat || 'american',
        legResult: leg.legResult || 'hit'
      }))
      const nextCount = Math.max(2, normalizedLegs.length || 2)
      setParlayLegCount(nextCount)
      setParlayLegs(normalizedLegs.length ? normalizedLegs : [
        { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' },
        { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' }
      ])
    } else {
      setParlayLegCount(2)
      setParlayLegs([
        { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' },
        { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' }
      ])
    }
  }

  const handleDeleteBet = async (id) => {
    if (confirm('Delete this entry? This cannot be undone.')) {
      try {
        // Check if bet is in queue (local) or synced (remote)
        const queuedItem = getQueuedBets().find(q => q.id === id)
        
        if (queuedItem) {
          // Delete from queue
          removeQueuedBet(id)
          const updatedQueued = getQueuedBetData()
          setQueuedBets(updatedQueued)
          console.log('handleDeleteBet: Queued bet deleted', id)
        } else {
          // Delete from synced bets (requires auth)
          if (!currentPin || !currentSalt || !currentProfile) {
            alert('Unlock required to delete synced bet.')
            return
          }
          
          const updatedBets = await deleteBet(id, bets, {
            currentProfile,
            currentPin,
            currentSalt,
            supabase,
            savedSetups
          })
          setBets(updatedBets)
          console.log('handleDeleteBet: Synced bet deleted', id)
        }
      } catch (error) {
        console.error('Error deleting bet:', error)
        const errorMessage = error?.message || 'Failed to delete bet. Please try again.'
        alert(`Error: ${errorMessage}`)
      }
    }
  }

  const handleExportBets = () => {
    const dataStr = JSON.stringify(bets, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `edge-lab-bets-${new Date().toISOString().split('T')[0]}.json`
    link.click()
  }

  const handleImportBets = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result)
        if (Array.isArray(imported)) {
          if (confirm(`Import ${imported.length} bets? This will replace your current bets.`)) {
            setBets(imported)
            // Save imported bets using canonical store
            try {
              await saveBets(imported, {
                currentProfile,
                currentPin,
                currentSalt,
                supabase,
                savedSetups
              })
              console.log('handleImportBets: stats recomputed')
            } catch (error) {
              console.error('Error saving imported bets:', error)
              const errorMessage = error?.message || 'Failed to save imported bets. Please try again.'
              alert(`Error: ${errorMessage}`)
            }
          }
        } else {
          alert('Invalid file format')
        }
      } catch (error) {
        alert('Error reading file: ' + error.message)
      }
    }
    reader.readAsText(file)
    e.target.value = '' // Reset input
  }

  // Combine synced bets + queued bets for display
  const allBets = [...bets, ...queuedBets]
  
  // Sort bets by timestamp (newest first) for display
  const sortedBetsForDisplay = [...allBets].sort((a, b) => {
    const dateA = new Date(a.timestamp || a.date || a.created_at)
    const dateB = new Date(b.timestamp || b.date || b.created_at)
    return dateB - dateA // newest first
  })
  const filteredBetsForList = analytics ? analytics.filteredBets : sortedBetsForDisplay

  // Breakdown Table Component
  const BreakdownTable = ({ title, data, keyField }) => {
    if (!data || data.length === 0) return null
    
    return (
      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-section">
          <h3 className="section-title">{title}</h3>
          <div className="breakdown-table">
            <div className="breakdown-table-header">
              <div>Category</div>
              <div>Bets</div>
              <div>Win Rate</div>
              <div>ROI</div>
              <div>Profit ($)</div>
            </div>
            {data.map((item, idx) => (
              <div key={idx} className="breakdown-table-row">
                <div><strong>{item[keyField]}</strong></div>
                <div>{item.bets}</div>
                <div>{item.winRate.toFixed(1)}%</div>
                <div className={item.roi >= 0 ? 'positive' : 'negative'}>
                  {item.roi >= 0 ? '+' : ''}{item.roi.toFixed(2)}%
                </div>
                <div className={(item.profit || item.profitUnits || 0) >= 0 ? 'positive' : 'negative'}>
                  ${(item.profit || item.profitUnits || 0) >= 0 ? '+' : ''}{(item.profit || item.profitUnits || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Check if we're on the reset-pin route (public route, don't gate it)
  const isResetPinRoute = window.location.pathname === '/reset-pin'
  
  if (isResetPinRoute) {
    return <ResetPin />
  }

  // Force login screen as first screen
  if (checking) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  // If no session, login page MUST be the first screen
  if (!session) {
    return <Auth onAuthenticated={handleAuthenticated} />
  }

  // Session exists - show main app (profile loading handled internally if needed)
  // If locked or no profile, Auth component will handle it via handleAuthenticated
  if (!currentProfile || isLocked) {
    return <Auth onAuthenticated={handleAuthenticated} />
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="app-title">EDGE LAB</h1>
          <p className="tagline">Turn odds into truth.</p>
        </div>
        <div className="header-right">
          {currentProfile && (
            <>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>
                {currentProfile.username}
              </span>
              <button className="btn btn-small btn-secondary" onClick={handleLock} style={{ marginRight: '0.5rem' }}>
                🔒 Lock
              </button>
              <button className="btn btn-small btn-secondary" onClick={handleSwitchUser} style={{ marginRight: '1rem' }}>
                Switch User
              </button>
            </>
          )}
          <span className="offline-badge">● Online</span>
          <span className="microcopy">Calculator only — does not place bets.</span>
        </div>
      </header>

      <main className="main-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab ${activeTab === 'arb' ? 'active' : ''}`}
            onClick={() => setActiveTab('arb')}
          >
            Arb Checker
          </button>
          <button
            className={`tab ${activeTab === 'reality' ? 'active' : ''}`}
            onClick={() => setActiveTab('reality')}
          >
            Reality Check
          </button>
          <button
            className={`tab ${activeTab === 'converter' ? 'active' : ''}`}
            onClick={() => setActiveTab('converter')}
          >
            Odds Converter
          </button>
          <button
            className={`tab ${activeTab === 'journal' ? 'active' : ''}`}
            onClick={() => setActiveTab('journal')}
          >
            Journal
          </button>
          <button
            className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`tab ${activeTab === 'insights' ? 'active' : ''}`}
            onClick={() => setActiveTab('insights')}
          >
            Insights
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="card tab-content">
            <Overview bets={bets} />
          </div>
        )}

        {activeTab === 'arb' && (
          <div className="card tab-content">
            <div className="card-section">
              <h2 className="section-title">Odds Inputs (2-way)</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label className="label">Side A Odds</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="-110 or 1.9091"
                    value={oddsA}
                    onChange={(e) => setOddsA(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Side B Odds</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="+120 or 2.2000"
                    value={oddsB}
                    onChange={(e) => setOddsB(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Total Stake ($)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="200"
                    value={totalStake}
                    onChange={(e) => setTotalStake(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              {arbResult ? (
                arbResult.error ? (
                  <div className="error-message" style={{ marginTop: '1.5rem' }}>
                    {arbResult.error}
                  </div>
                ) : (
                  <div className="results">
                  <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>Results</h2>
                  
                  {/* Summary Cards */}
                  <div className="probability-display" style={{ marginBottom: '1.5rem' }}>
                    <div className="stat-card">
                      <div className="stat-card-label">Side A</div>
                      <div className="stat-card-value">{arbResult.decimalA.toFixed(4)}</div>
                      <div className="stat-card-sublabel">Decimal Odds</div>
                      <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Implied Probability: <strong>{(arbResult.probA * 100).toFixed(2)}%</strong>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card-label">Side B</div>
                      <div className="stat-card-value">{arbResult.decimalB.toFixed(4)}</div>
                      <div className="stat-card-sublabel">Decimal Odds</div>
                      <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Implied Probability: <strong>{(arbResult.probB * 100).toFixed(2)}%</strong>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card-label">Combined Implied Sum</div>
                      <div className={`stat-card-value ${arbResult.arb ? 'positive' : 'negative'}`}>
                        {arbResult.impliedSum.toFixed(6)}
                      </div>
                      <div className="stat-card-sublabel">
                        {arbResult.arb ? 'ARB EXISTS' : 'NO ARB'}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className={`arb-status ${arbResult.arb ? 'exists' : 'none'}`} style={{ marginBottom: '2rem' }}>
                    {arbResult.arb
                      ? '✓ ARB EXISTS — Combined implied sum < 1.0000'
                      : `NO ARB — Overround: ${arbResult.overround.toFixed(2)}%. Need better pricing by ${arbResult.overround.toFixed(2)}% to reach arb.`}
                  </div>

                  {arbResult.arb && (
                    <>
                      <div className="stake-results">
                        <h3 className="section-title" style={{ marginTop: '2rem' }}>Stake Split</h3>
                        <div className="stake-grid">
                          <div className="stake-item">
                            <div className="stake-label">Stake A</div>
                            <div className="stake-value">${arbResult.stakeA.toFixed(2)}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                              Rounded: ${arbResult.roundedA.toFixed(2)}
                            </div>
                          </div>
                          <div className="stake-item">
                            <div className="stake-label">Stake B</div>
                            <div className="stake-value">${arbResult.stakeB.toFixed(2)}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                              Rounded: ${arbResult.roundedB.toFixed(2)}
                            </div>
                          </div>
                          <div className="stake-item">
                            <div className="stake-label">Payout if A Wins</div>
                            <div className="stake-value">${arbResult.payoutA.toFixed(2)}</div>
                          </div>
                          <div className="stake-item">
                            <div className="stake-label">Payout if B Wins</div>
                            <div className="stake-value">${arbResult.payoutB.toFixed(2)}</div>
                          </div>
                        </div>

                        <div className="profit-display">
                          <div className="profit-label">Guaranteed Profit (After Rounding)</div>
                          <div className="profit-amount">${arbResult.worstProfit.toFixed(2)}</div>
                          <div className="profit-percent">{arbResult.worstProfitPercent.toFixed(2)}%</div>
                        </div>
                      </div>

                      <div className="rounding-controls">
                        <h3 className="section-title">Rounding Controls</h3>
                        <div className="rounding-toggle-group">
                          <button
                            className={`rounding-toggle ${rounding === 1 ? 'active' : ''}`}
                            onClick={() => setRounding(1)}
                          >
                            $1
                          </button>
                          <button
                            className={`rounding-toggle ${rounding === 5 ? 'active' : ''}`}
                            onClick={() => setRounding(5)}
                          >
                            $5
                          </button>
                          <button
                            className={`rounding-toggle ${rounding === 10 ? 'active' : ''}`}
                            onClick={() => setRounding(10)}
                          >
                            $10
                          </button>
                        </div>
                        <div className="rounding-impact">
                          <strong>After rounding to nearest ${rounding}:</strong><br />
                          Worst-case profit: ${arbResult.worstProfit.toFixed(2)} ({arbResult.worstProfitPercent.toFixed(2)}%)
                        </div>
                        {arbResult.worstProfit <= 0 && (
                          <div className="rounding-warning">
                            ⚠ Rounding removed the edge. Try a smaller rounding increment or larger bankroll.
                          </div>
                        )}
                      </div>

                      <div className="btn-group">
                        <button className="btn" onClick={handleSave}>
                          Save Setup
                        </button>
                        <button className="btn btn-secondary" onClick={handleCopyShare}>
                          Copy Share Text
                        </button>
                      </div>
                    </>
                  )}
                  </div>
                )
              ) : null}
            </div>
          </div>
        )}

        {activeTab === 'reality' && (
          <div className="card reality-check tab-content">
            <div className="card-section">
              <h2 className="section-title">Reality Check</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                Enter your parlay details to see the true probability of hitting all legs.
              </p>

              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label className="label">Number of Legs</label>
                <input
                  type="number"
                  className="input"
                  value={legCount}
                  onChange={(e) => {
                    const newCount = Math.max(2, Math.min(20, parseInt(e.target.value) || 2))
                    setLegCount(newCount)
                  }}
                  min="2"
                  max="20"
                  style={{ maxWidth: '150px' }}
                />
              </div>

              <div className="leg-probabilities-section">
                <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>Leg Odds</h3>
                {legOdds.slice(0, legCount).map((odds, index) => {
                  const format = legOddsFormats[index] || 'american'
                  const impliedPercent = getImpliedPercent(odds, format)
                  const hasWarning = typeof impliedPercent === 'number' && impliedPercent > 80
                  const isWeakest = realityResult && realityResult.weakestIndex === index

                  return (
                    <div key={index} className="leg-probability-input" style={{ marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label className="label" style={{ marginBottom: 0 }}>
                          Leg {index + 1} Odds
                          {isWeakest && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--accent-red)', fontStyle: 'italic' }}>
                              (Weakest leg)
                            </span>
                          )}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <select
                            className="input"
                            style={{ width: '130px' }}
                            value={format}
                            onChange={(e) => updateLegOddsFormat(index, e.target.value)}
                          >
                            <option value="american">American</option>
                            <option value="decimal">Decimal</option>
                            <option value="fractional">Fractional</option>
                          </select>
                          <input
                            type="text"
                            className="input"
                            style={{ width: '120px', textAlign: 'center' }}
                            placeholder={getDefaultOddsValue(format)}
                            value={odds}
                            onChange={(e) => updateLegOdds(index, e.target.value)}
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Implied probability: {typeof impliedPercent === 'number' ? `${impliedPercent.toFixed(2)}%` : '—'}
                      </div>
                      {hasWarning && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--accent-yellow)', fontStyle: 'italic' }}>
                          ⚠ High implied probability (&gt;80%)
                        </div>
                      )}
                      {isWeakest && realityResult && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          This leg contributes the most risk to your parlay.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="btn-group" style={{ marginTop: '1.5rem' }}>
                <button className="btn btn-secondary" type="button" onClick={() => setShowShopOdds(true)}>
                  Shop Odds
                </button>
              </div>

              {realityResult && (
                <>
                  {/* Straight Parlay Result */}
                  <div className="reality-result" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
                    <div className="reality-result-label">Straight Parlay: All Legs Hit</div>
                    <div className="reality-result-value">{realityResult.allHitPercent.toFixed(4)}%</div>
                    <div className="reality-result-description">
                      Probability that all {legCount} legs hit: <strong>{realityResult.allHitPercent.toFixed(4)}%</strong>
                      <br />
                      That's approximately <strong>1 in {realityResult.allHitProb > 0 ? Math.round(1 / realityResult.allHitProb).toLocaleString() : '∞'}</strong> attempts.
                    </div>
                  </div>

                  <div className="card" style={{ marginBottom: '2rem' }}>
                    <div className="card-section">
                      <h3 className="section-title">Parlay Difficulty Score</h3>
                      <div className="reality-result-value" style={{ fontSize: '2.5rem' }}>
                        {realityResult.difficultyScore}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        0–99 score based on leg probabilities and leg count.
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Informational only — not betting advice.
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ marginBottom: '2rem' }}>
                    <div className="card-section">
                      <h3 className="section-title">Price Quality Score</h3>
                      <div className="reality-result-value" style={{ fontSize: '2.5rem' }}>
                        {realityResult.priceQualityAvailable ? realityResult.priceQualityScore : '—'}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        {realityResult.priceQualityAvailable ? '0–99 score based on odds quality.' : '— (connect odds provider)'}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Informational only — not betting advice.
                      </div>
                    </div>
                  </div>

                  {/* Flex Play Results Table */}
                  <div className="card" style={{ marginTop: '2rem' }}>
                    <div className="card-section">
                      <h3 className="section-title">Flex Play Probabilities</h3>
                      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                        Probability of exactly k legs hitting and at least k legs hitting.
                      </p>
                      
                      <div className="flex-probability-table">
                        <div className="flex-table-header">
                          <div>Outcome</div>
                          <div>Exactly k</div>
                          <div>At Least k</div>
                          <div>Visual</div>
                        </div>
                        {realityResult.outcomes.map((outcome, idx) => {
                          const maxProb = Math.max(...realityResult.outcomes.map(o => o.exactly))
                          const barWidth = maxProb > 0 ? (outcome.exactly / maxProb) * 100 : 0
                          
                          return (
                            <div key={idx} className="flex-table-row">
                              <div className="flex-outcome-label">
                                <strong>{outcome.k} of {legCount}</strong>
                              </div>
                              <div className="flex-prob-cell">
                                <div>{outcome.exactlyPercent.toFixed(2)}%</div>
                                <div className="flex-prob-sublabel">1 in {outcome.exactly > 0 ? Math.round(1 / outcome.exactly).toLocaleString() : '∞'}</div>
                              </div>
                              <div className="flex-prob-cell">
                                <div>{outcome.atLeastPercent.toFixed(2)}%</div>
                                <div className="flex-prob-sublabel">1 in {outcome.atLeast > 0 ? Math.round(1 / outcome.atLeast).toLocaleString() : '∞'}</div>
                              </div>
                              <div className="flex-prob-bar-cell">
                                <div className="flex-prob-bar-container">
                                  <div 
                                    className="flex-prob-bar" 
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            {showShopOdds && (
              <div className="modal-backdrop" onClick={() => setShowShopOdds(false)}>
                <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Shop Odds</h3>
                    <button className="btn btn-small" onClick={() => setShowShopOdds(false)}>Close</button>
                  </div>
                  <div className="modal-body">
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      Compare your odds to the best available line (when connected).
                    </p>
                    <div className="modal-table">
                      <div className="modal-table-row modal-table-header">
                        <div>Leg</div>
                        <div>Your Odds</div>
                        <div>Best Odds</div>
                        <div>Delta</div>
                      </div>
                      {buildShopOddsRows().map((row) => (
                        <div key={row.index} className="modal-table-row">
                          <div>Leg {row.index + 1}</div>
                          <div>{row.oddsText || '—'} ({row.oddsFormat})</div>
                          <div>{row.bestOdds ? `${row.bestOdds.oddsText} (${row.bestOdds.oddsFormat})` : '—'}</div>
                          <div>
                            {row.delta !== null
                              ? `${(row.delta * 100).toFixed(2)}%`
                              : '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      <button className="btn" type="button">Connect odds provider to enable</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {import.meta.env.DEV && (
              <div className="card" style={{ marginTop: '2rem' }}>
                <div className="card-section">
                  <h3 className="section-title">Odds Debug (Dev Only)</h3>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    American -110 → {impliedProbToPercent(oddsToImpliedProb('-110', 'american'))?.toFixed(2)}%
                    <br />
                    Decimal 1.91 → {impliedProbToPercent(oddsToImpliedProb('1.91', 'decimal'))?.toFixed(2)}%
                    <br />
                    Fractional 10/11 → {impliedProbToPercent(oddsToImpliedProb('10/11', 'fractional'))?.toFixed(2)}%
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'converter' && (
          <OddsConverter />
        )}

        {activeTab === 'journal' && (
          <div className="journal-container tab-content">
            {/* Bet Form */}
            <div className="card">
              <div className="card-section">
                <h2 className="section-title">{editingBet ? 'Edit Bet' : 'Add Bet'}</h2>
                <div>
                  <div className="rounding-toggle-group" style={{ marginBottom: '1.5rem' }}>
                    <button
                      className={`rounding-toggle ${betForm.betType === 'straight' ? 'active' : ''}`}
                      onClick={() => setBetForm({ ...betForm, betType: 'straight' })}
                      type="button"
                    >
                      Straight
                    </button>
                    <button
                      className={`rounding-toggle ${betForm.betType === 'parlay' ? 'active' : ''}`}
                      onClick={() => setBetForm({ ...betForm, betType: 'parlay' })}
                      type="button"
                    >
                      Parlay
                    </button>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="label">Date & Time *</label>
                      <input
                        type="datetime-local"
                        className="input"
                        value={betForm.date}
                        onChange={(e) => setBetForm({...betForm, date: e.target.value})}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="label">Sport/League *</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="NFL, NBA, etc."
                        value={betForm.sport}
                        onChange={(e) => setBetForm({...betForm, sport: e.target.value})}
                        required
                      />
                    </div>
                    {betForm.betType === 'straight' && (
                      <div className="form-group">
                        <label className="label">Market Type *</label>
                        <select
                          className="input"
                          value={betForm.marketType}
                          onChange={(e) => setBetForm({...betForm, marketType: e.target.value})}
                          required
                        >
                          <option value="ML">Moneyline (ML)</option>
                          <option value="Spread">Spread</option>
                          <option value="Total">Total (Over/Under)</option>
                          <option value="Prop">Prop</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    )}
                    <div className="form-group">
                      <label className="label">Book / App Used *</label>
                      <select
                        className="input"
                        value={betForm.book}
                        onChange={(e) => setBetForm({...betForm, book: e.target.value})}
                        required
                      >
                        <option value="">Select...</option>
                        <option value="DraftKings">DraftKings</option>
                        <option value="FanDuel">FanDuel</option>
                        <option value="PrizePicks">PrizePicks</option>
                        <option value="BetMGM">BetMGM</option>
                        <option value="Caesars">Caesars</option>
                        <option value="HardRock">HardRock</option>
                        <option value="Polymarket">Polymarket</option>
                        <option value="Kalshi">Kalshi</option>
                        <option value="Online Book">Online Book</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    {betForm.betType === 'straight' && (
                      <>
                        <div className="form-group">
                          <label className="label">Odds Format *</label>
                          <select
                            className="input"
                            value={betForm.oddsFormat}
                            onChange={(e) => setBetForm({ ...betForm, oddsFormat: e.target.value })}
                            required
                          >
                            <option value="american">American</option>
                            <option value="decimal">Decimal</option>
                            <option value="fractional">Fractional</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="label">Odds *</label>
                          <input
                            type="text"
                            className="input"
                            placeholder={getDefaultOddsValue(betForm.oddsFormat)}
                            value={betForm.odds}
                            onChange={(e) => setBetForm({...betForm, odds: e.target.value})}
                            required
                          />
                        </div>
                      </>
                    )}
                    {betForm.betType === 'parlay' && (
                      <div className="form-group">
                        <label className="label">Number of Legs *</label>
                        <input
                          type="number"
                          className="input"
                          min="2"
                          max="20"
                          value={parlayLegCount}
                          onChange={(e) => setParlayLegCount(Math.max(2, Math.min(20, parseInt(e.target.value) || 2)))}
                          required
                        />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="label">Stake ($) *</label>
                      <input
                        type="number"
                        className="input"
                        placeholder="50.00"
                        step="0.01"
                        min="0"
                        value={betForm.stake}
                        onChange={(e) => setBetForm({...betForm, stake: e.target.value})}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="label">Result *</label>
                      <select
                        className="input"
                        value={betForm.result}
                        onChange={(e) => setBetForm({...betForm, result: e.target.value})}
                        required
                      >
                        <option value="Win">Win</option>
                        <option value="Loss">Loss</option>
                        <option value="Push">Push</option>
                        <option value="Void">Void</option>
                      </select>
                    </div>
                    {betForm.betType === 'parlay' && (
                      <div className="form-group">
                        <label className="label">Payout ($) *</label>
                        <input
                          type="number"
                          className="input"
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          value={betForm.payout}
                          onChange={(e) => setBetForm({ ...betForm, payout: e.target.value })}
                          required
                        />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="label">Confidence (1-10)</label>
                      <div className="slider-group">
                        <div className="slider-label">
                          <span>Confidence</span>
                          <span className="slider-value">{betForm.confidence}</span>
                        </div>
                        <input
                          type="range"
                          className="slider"
                          min="1"
                          max="10"
                          value={betForm.confidence}
                          onChange={(e) => setBetForm({...betForm, confidence: parseInt(e.target.value)})}
                        />
                      </div>
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label className="label">Notes (Optional)</label>
                      <textarea
                        className="input"
                        rows="3"
                        placeholder="Any additional notes..."
                        value={betForm.notes}
                        onChange={(e) => setBetForm({...betForm, notes: e.target.value})}
                      />
                    </div>
                  </div>
                  {betForm.betType === 'parlay' && (
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                      <div className="card-section">
                        <h3 className="section-title" style={{ fontSize: '1rem' }}>Parlay Legs</h3>
                        {parlayLegs.map((leg, index) => {
                          const impliedPercent = getImpliedPercent(leg.oddsText, leg.oddsFormat)
                          return (
                            <div key={index} className="leg-probability-input" style={{ marginBottom: '1rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <strong>Leg {index + 1}</strong>
                                <select
                                  className="input"
                                  style={{ width: '120px' }}
                                  value={leg.legResult}
                                  onChange={(e) => updateParlayLeg(index, { legResult: e.target.value })}
                                >
                                  <option value="hit">Hit</option>
                                  <option value="miss">Miss</option>
                                  <option value="push">Push</option>
                                  <option value="void">Void</option>
                                </select>
                              </div>
                              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                                <div className="form-group">
                                  <label className="label">Market</label>
                                  <input
                                    type="text"
                                    className="input"
                                    value={leg.market}
                                    onChange={(e) => updateParlayLeg(index, { market: e.target.value })}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="label">Selection</label>
                                  <input
                                    type="text"
                                    className="input"
                                    value={leg.selection}
                                    onChange={(e) => updateParlayLeg(index, { selection: e.target.value })}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="label">Line</label>
                                  <input
                                    type="text"
                                    className="input"
                                    value={leg.line}
                                    onChange={(e) => updateParlayLeg(index, { line: e.target.value })}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="label">Odds Format</label>
                                  <select
                                    className="input"
                                    value={leg.oddsFormat}
                                    onChange={(e) => updateParlayLeg(index, { oddsFormat: e.target.value })}
                                  >
                                    <option value="american">American</option>
                                    <option value="decimal">Decimal</option>
                                    <option value="fractional">Fractional</option>
                                  </select>
                                </div>
                                <div className="form-group">
                                  <label className="label">Odds</label>
                                  <input
                                    type="text"
                                    className="input"
                                    placeholder={getDefaultOddsValue(leg.oddsFormat)}
                                    value={leg.oddsText}
                                    onChange={(e) => updateParlayLeg(index, { oddsText: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Implied probability: {typeof impliedPercent === 'number' ? `${impliedPercent.toFixed(2)}%` : '—'}
                              </div>
                            </div>
                          )
                        })}
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          Overall implied probability:{' '}
                          {(() => {
                            const implied = calculateParlayImpliedProb(parlayLegs)
                            return implied ? `${(implied * 100).toFixed(4)}%` : '—'
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                  {betFormMessage.type && (
                    <div className={betFormMessage.type === 'success' ? 'success-message' : 'error-message'} style={{ marginBottom: '1rem' }}>
                      <div>{betFormMessage.text}</div>
                    </div>
                  )}
                  
                  {/* Wrap Add Bet form in Error Boundary */}
                  <BetFormErrorBoundary>
                    {/* Sync indicator and retry button */}
                    {syncing && (
                    <div style={{
                      marginBottom: '1rem',
                      padding: '0.75rem',
                      backgroundColor: 'rgba(132, 210, 246, 0.12)',
                      border: '1px solid rgba(132, 210, 246, 0.35)',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      color: 'var(--text)'
                    }}>
                      🔄 Syncing bets to server...
                    </div>
                  )}
                  {!syncing && getQueuedBets().filter(q => q.status === 'pending').length > 0 && (
                    <div style={{
                      marginBottom: '1rem',
                      padding: '0.75rem',
                      backgroundColor: 'rgba(132, 210, 246, 0.12)',
                      border: '1px solid rgba(132, 210, 246, 0.35)',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>
                        ⏳ {getQueuedBets().filter(q => q.status === 'pending').length} bet(s) pending sync
                      </span>
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={handleRetrySync}
                        disabled={!currentPin || !currentSalt || !currentProfile}
                      >
                        Retry sync
                      </button>
                    </div>
                  )}
                  
                  <div className="btn-group">
                    <button 
                      type="button" 
                      className="btn" 
                      onClick={(e) => {
                        // EMERGENCY FIX: Force prevent all navigation/reload
                        e.preventDefault()
                        e.stopPropagation()
                        // Call handler - all errors caught inside
                        handleBetSubmit(e).catch((err) => {
                          console.error('ADD_BET handler error:', err)
                          setBetFormMessage({ type: 'error', text: 'An error occurred. Please try again.' })
                        })
                        // Return false as extra safety
                        return false
                      }}
                      disabled={!authReady || !session?.user?.id || !currentPin || !currentSalt}
                    >
                      {!authReady || !session?.user?.id 
                        ? 'Loading...' 
                        : (!currentPin || !currentSalt)
                        ? 'Unlock first to access encrypted data'
                        : (editingBet ? 'Update Bet' : 'Add Bet')
                      }
                    </button>
                    {(!currentPin || !currentSalt) && session?.user?.id && (
                      <div style={{
                        marginTop: '0.5rem',
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic'
                      }}>
                        Unlock first to access encrypted data.
                      </div>
                    )}
                    {editingBet && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingBet(null)
                          setBetFormMessage({ type: null, text: '' })
                          setBetForm({
                            date: new Date().toISOString().slice(0, 16),
                            sport: '',
                            marketType: 'ML',
                            book: '',
                            odds: '',
                            oddsFormat: 'american',
                            stake: '',
                            result: 'Win',
                            payout: '',
                            confidence: 5,
                            notes: '',
                            betType: 'straight'
                          })
                          setParlayLegCount(2)
                          setParlayLegs([
                            { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' },
                            { market: '', selection: '', line: '', oddsText: '', oddsFormat: 'american', legResult: 'hit' }
                          ])
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  </BetFormErrorBoundary>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ marginTop: '2rem' }}>
              <div className="card-section">
                <h2 className="section-title">Filters</h2>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="label">Sport</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Filter by sport..."
                      value={filters.sport}
                      onChange={(e) => setFilters({...filters, sport: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Market Type</label>
                    <select
                      className="input"
                      value={filters.marketType}
                      onChange={(e) => setFilters({...filters, marketType: e.target.value})}
                    >
                      <option value="">All</option>
                      <option value="ML">ML</option>
                      <option value="Spread">Spread</option>
                      <option value="Total">Total</option>
                      <option value="Prop">Prop</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Result</label>
                    <select
                      className="input"
                      value={filters.result}
                      onChange={(e) => setFilters({...filters, result: e.target.value})}
                    >
                      <option value="">All</option>
                      <option value="Win">Win</option>
                      <option value="Loss">Loss</option>
                      <option value="Push">Push</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Odds Min</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="-200"
                      value={filters.oddsMin}
                      onChange={(e) => setFilters({...filters, oddsMin: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Odds Max</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="+200"
                      value={filters.oddsMax}
                      onChange={(e) => setFilters({...filters, oddsMax: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Date From</label>
                    <input
                      type="date"
                      className="input"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Date To</label>
                    <input
                      type="date"
                      className="input"
                      value={filters.dateTo}
                      onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">&nbsp;</label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setFilters({
                        sport: '',
                        marketType: '',
                        result: '',
                        oddsMin: '',
                        oddsMax: '',
                        dateFrom: '',
                        dateTo: ''
                      })}
                    >
                      Clear Filters
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bets List */}
            <div className="card" style={{ marginTop: '2rem' }}>
              <div className="card-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 className="section-title" style={{ marginBottom: 0 }}>Bets ({filteredBetsForList.length})</h2>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-small btn-secondary" onClick={handleExportBets}>
                      Export JSON
                    </button>
                    <label className="btn btn-small btn-secondary" style={{ cursor: 'pointer' }}>
                      Import JSON
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportBets}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>
                {filteredBetsForList.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <p>No bets recorded yet.</p>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      Add your first bet above to start tracking.
                    </p>
                  </div>
                ) : (
                  <div className="bets-list">
                    {filteredBetsForList.map((bet) => {
                      const profit = calculateBetProfit(bet)
                      const decimalOdds = getDecimalOddsForBet(bet)
                      // Check if bet is queued (pending sync)
                      const isQueued = getQueuedBets().some(q => q.id === bet.id && q.status === 'pending')
                      
                      return (
                        <div key={bet.id} className="bet-item">
                          <div className="bet-header">
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <strong>{bet.sport}</strong> • {bet.marketType}
                                {bet.book && <span> • {bet.book}</span>}
                                {isQueued && (
                                  <span style={{
                                    fontSize: '0.75rem',
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: 'rgba(132, 210, 246, 0.12)',
                                    border: '1px solid rgba(132, 210, 246, 0.35)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    fontWeight: '600'
                                  }}>
                                    ⏳ Pending sync
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                {new Date(bet.timestamp || bet.date || bet.created_at).toLocaleString()}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                              <div 
                                style={{
                                  padding: '0.5rem 1rem',
                                  borderRadius: '8px',
                                  fontWeight: '700',
                                  fontSize: '1rem',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  backgroundColor: 'rgba(132, 210, 246, 0.12)',
                                  color: 'var(--text)',
                                  border: '2px solid var(--accent)'
                                }}
                              >
                                {bet.result}
                              </div>
                              <div 
                                style={{
                                  fontSize: '1.125rem',
                                  fontWeight: '600',
                                  color: 'var(--accent)'
                                }}
                              >
                                ${profit >= 0 ? '+' : ''}{profit.toFixed(2)}
                              </div>
                            </div>
                          </div>
                          <div className="bet-details">
                            <div>Type: {bet.betType === 'parlay' ? 'Parlay' : 'Straight'}</div>
                            <div>
                              Odds: {bet.odds || '—'} {(bet.decimalOdds || decimalOdds) && `(${(bet.decimalOdds || decimalOdds).toFixed(4)})`}
                            </div>
                            <div>Stake: ${bet.stake.toFixed(2)}</div>
                            {bet.betType === 'parlay' && (
                              <>
                                <div>Legs: {Array.isArray(bet.legs) ? bet.legs.length : '—'}</div>
                                {bet.payout !== undefined && <div>Payout: ${bet.payout.toFixed(2)}</div>}
                              </>
                            )}
                            {bet.book && <div>Book: {bet.book}</div>}
                            <div>Confidence: {bet.confidence}/10</div>
                            {bet.notes && <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', fontStyle: 'italic' }}>{bet.notes}</div>}
                          </div>
                          <div className="bet-actions">
                            <button className="btn btn-small" onClick={() => handleEditBet(bet)}>
                              Edit
                            </button>
                            <button className="btn btn-small btn-secondary" onClick={() => handleDeleteBet(bet.id)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Analytics Dashboard */}
            {analytics && (
              <div className="analytics-dashboard" style={{ marginTop: '2rem' }}>
                {/* Overall Stats */}
                <div className="card">
                  <div className="card-section">
                    <h2 className="section-title">Overall Performance</h2>
                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-card-label">Total Bets</div>
                        <div className="stat-card-value">{analytics.overall.totalBets}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-card-label">Wins / Losses / Pushes</div>
                        <div className="stat-card-value">{analytics.overall.wins} / {analytics.overall.losses} / {analytics.overall.pushes}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-card-label">Win Rate</div>
                        <div className="stat-card-value">{analytics.overall.winRate.toFixed(1)}%</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-card-label">Total Risked</div>
                        <div className="stat-card-value">${(analytics.overall.totalRisked || analytics.overall.totalUnits || 0).toFixed(2)}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-card-label">Profit</div>
                        <div className={`stat-card-value ${(analytics.overall.profit || analytics.overall.profitUnits || 0) >= 0 ? 'positive' : 'negative'}`}>
                          ${(analytics.overall.profit || analytics.overall.profitUnits || 0) >= 0 ? '+' : ''}{(analytics.overall.profit || analytics.overall.profitUnits || 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-card-label">ROI</div>
                        <div className={`stat-card-value ${analytics.overall.roi >= 0 ? 'positive' : 'negative'}`}>
                          {analytics.overall.roi >= 0 ? '+' : ''}{analytics.overall.roi.toFixed(2)}%
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-card-label">Avg Odds</div>
                        <div className="stat-card-value">{analytics.overall.avgOdds.toFixed(4)}</div>
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
                        {analytics.strengths.length > 0 ? (
                          <div className="breakdown-list">
                            {analytics.strengths.map((item, idx) => (
                              <div key={idx} className="breakdown-item positive">
                                <div><strong>{item.sport || item.marketType}</strong></div>
                                <div>ROI: {item.roi.toFixed(1)}% • {item.bets} bets • ${(item.profit || item.profitUnits || 0) >= 0 ? '+' : ''}{(item.profit || item.profitUnits || 0).toFixed(2)}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ color: 'var(--text-muted)' }}>Need at least 10 bets in a category</p>
                        )}
                      </div>
                      <div>
                        <h3 className="section-title" style={{ color: 'var(--accent-red)' }}>Avoid</h3>
                        {analytics.avoidList.length > 0 ? (
                          <div className="breakdown-list">
                            {analytics.avoidList.map((item, idx) => (
                              <div key={idx} className="breakdown-item negative">
                                <div><strong>{item.sport || item.marketType}</strong></div>
                                <div>ROI: {item.roi.toFixed(1)}% • {item.bets} bets • ${(item.profit || item.profitUnits || 0) >= 0 ? '+' : ''}{(item.profit || item.profitUnits || 0).toFixed(2)}</div>
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

                {/* Breakdown Tables */}
                <BreakdownTable title="By Sport/League" data={analytics.bySport} keyField="sport" />
                <BreakdownTable title="By Market Type" data={analytics.byMarket} keyField="marketType" />
                <BreakdownTable title="By Book/App" data={analytics.byBook} keyField="book" />
                <BreakdownTable title="By Odds Range" data={analytics.byOddsRange} keyField="range" />
                <BreakdownTable title="By Confidence" data={analytics.byConfidence} keyField="bucket" />
                <BreakdownTable title="By Time of Day" data={analytics.byTime} keyField="timeOfDay" />
              </div>
            )}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="tab-content">
            <Dashboard 
              bets={bets} 
              profileId={currentProfile?.id} 
            />
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="card tab-content">
            <Insights bets={bets} />
          </div>
        )}
      </main>

      <footer className="footer">
        <p>
          <strong>EDGE LAB</strong> — Calculator only. Odds move. Limits/voids happen. Use responsibly.
        </p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.7rem' }}>
          No hype. Just math.
        </p>
      </footer>
    </div>
  )
}

export default App



