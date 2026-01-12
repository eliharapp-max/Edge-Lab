import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export function useSubscription(userId) {
  const [isPro, setIsPro] = useState(false)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshSubscription = async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    try {
      // Fetch user profile for is_pro
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('is_pro')
        .eq('user_id', userId)
        .single()

      if (profileError) {
        console.error('Error fetching subscription status:', profileError)
        setIsPro(false)
        setStatus(null)
      } else {
        setIsPro(profile?.is_pro || false)
      }

      // Optionally fetch subscription details
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', userId)
        .single()

      if (subscription) {
        setStatus(subscription.status)
      } else {
        setStatus(null)
      }
    } catch (error) {
      console.error('Error refreshing subscription:', error)
      setIsPro(false)
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshSubscription()
  }, [userId])

  return {
    isPro,
    status,
    loading,
    refreshSubscription,
  }
}
