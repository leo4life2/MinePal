import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { ReactNode, useEffect, useState } from 'react';
import { SupabaseContext, SupabaseContextType, StripeData } from './SupabaseContext';
import { SUPABASE_URL, SUPABASE_ANON_KEY, PRICING_PLANS, TierType, HTTPS_BACKEND_URL } from '../../constants';
import { IpcRendererEvent } from 'electron';

// Get electron IPC renderer if we're in electron
const isElectron = window && window.process && window.process.type;
const electron = isElectron ? window.require('electron') : null;
const ipcRenderer = electron?.ipcRenderer;
const shell = electron?.shell;

interface SupabaseProviderProps {
  children: ReactNode;
}

export default function SupabaseProvider({ children }: SupabaseProviderProps) {
  const [supabase] = useState<SupabaseClient>(() => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });

    // --- START HACK: Override the internal _callRefreshToken method ---
    let refreshAttemptCount = 0;
    let cooldownStartTime = 0;
    // Allow 3 unconditional refreshes, then start cooldown
    const MAX_RAPID_REFRESHES = 3;
    const COOLDOWN_PERIOD_MS = 60 * 1000;
    
    // Inflight promise tracking to prevent concurrent calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
    let inflight: Promise<any> | null = null;
    let last = 0;
    const MIN = 60_000; // 60s debounce

    try { // Add try-catch for safety during override
        const originalCallRefreshToken = client.auth['_callRefreshToken'].bind(client.auth);

        // Important: Ensure this override happens *after* client initialization
        // but before any potential refresh calls. Usually placing it right after
        // createClient is sufficient.

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.auth['_callRefreshToken'] = async function(...args: any[]) {
          // Prevent concurrent calls - reuse the same promise
          if (inflight) {
            console.log('Supabase Auth: Reusing inflight refresh promise');
            return inflight;
          }
          
          const now = Date.now();
          
          // Debounce check
          if (now - last < MIN) {
            console.log('Supabase Auth: Debounced refresh, returning current session');
            const currentSession = await this.getSession();
            return { data: { session: currentSession?.data?.session || null }, error: null };
          }
          
          last = now;
          
          // Allow first 3 refreshes unconditionally
          if (refreshAttemptCount < MAX_RAPID_REFRESHES) {
            refreshAttemptCount++;
            console.log(`Supabase Auth: Unconditional refresh attempt ${refreshAttemptCount}/${MAX_RAPID_REFRESHES} at: ${new Date(now)}`);
          } else {
            // After 3 attempts, start applying cooldown
            if (cooldownStartTime === 0) {
              cooldownStartTime = now;
              console.log(`Supabase Auth: Starting cooldown period at: ${new Date(now)}`);
            }
            
            if (now - cooldownStartTime < COOLDOWN_PERIOD_MS) {
              // Get current session to check status
              const currentSession = await this.getSession();
              const sessionStatus = currentSession?.data?.session ? 'success' : 'no session';
              console.warn(`Supabase Auth: Refresh token request throttled. Cooldown period: ${COOLDOWN_PERIOD_MS}ms. Time remaining: ${COOLDOWN_PERIOD_MS - (now - cooldownStartTime)}ms. Session status: ${sessionStatus}`);
              // Return current session instead of null data
              return { data: { session: currentSession?.data?.session || null }, error: null }; 
            }
            
            // Reset counters after cooldown period
            refreshAttemptCount = 0;
            cooldownStartTime = 0;
          }

          console.log(`Supabase Auth: Initiating refresh token request at: ${new Date(now)}`);

          // Create and track the inflight promise
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          inflight = originalCallRefreshToken(...args).then((result: any) => {
            inflight = null;
            
            // Check if it was successful (adjust condition based on actual result structure)
            if (result && result.data && result.data.session) {
              console.log(`Supabase Auth: Refresh token successful at: ${new Date()}`);
              // Reset counters on successful refresh
              refreshAttemptCount = 0;
              cooldownStartTime = 0;
              // Make sure every renderer sees the fresh tokens
              this.setSession(result.data.session);
            } else {
              // Refresh failed, provide comprehensive error logging
              console.error('Supabase Auth: Refresh token attempt failed.');
              console.error('Supabase Auth: Complete result object:', JSON.stringify(result, null, 2));
              console.error('Supabase Auth: Result data:', result ? JSON.stringify(result.data, null, 2) : 'No result object');
              console.error('Supabase Auth: Result error:', result && result.error ? JSON.stringify(result.error, null, 2) : 'No error property in result');
              console.error('Supabase Auth: Result structure breakdown:', {
                hasResult: !!result,
                hasData: !!(result && result.data),
                hasSession: !!(result && result.data && result.data.session),
                hasError: !!(result && result.error),
                resultKeys: result ? Object.keys(result) : 'No result object',
                dataKeys: (result && result.data) ? Object.keys(result.data) : 'No data object'
              });
            }
            return result;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }).catch((e: any) => {
            inflight = null;
            // Reset counters on unexpected error
            refreshAttemptCount = 0;
            cooldownStartTime = 0;
            console.error('Supabase Auth: Unexpected error during _callRefreshToken override:', e);
            throw e; // Re-throw original error
          });

          return inflight;
        };
        console.log("Supabase Auth: _callRefreshToken override applied successfully.");

    } catch (overrideError) {
        console.error("Supabase Auth: Failed to override _callRefreshToken. Refresh loop protection inactive.", overrideError);
    }
    // --- END HACK ---

    return client;
  });

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [tierQuota, setTierQuota] = useState<number | null>(null);
  const [requestsRemaining, setRequestsRemaining] = useState<number | null>(null);
  const [imagineCredits, setImagineCredits] = useState<number | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<TierType>('FREE');
  const [stripeData, setStripeData] = useState<StripeData>({
    customerId: null,
    subscriptionId: null,
    subscriptionItemId: null
  });

  // Function to clear auth error
  const clearAuthError = () => {
    setAuthError(null);
  };

  // Function to save token to our backend endpoint
  const saveTokenToBackend = async (token?: string) => {
    try {
      await fetch('http://localhost:10101/save-jwt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token || '' })
      });
    } catch (error) {
      console.error('Failed to save token to backend:', error);
    }
  };

  // Function to fetch subscription data
  const fetchSubscriptionData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_subscription')
        .select('stripe_subscription_id, tier_quota, stripe_customer_id, stripe_subscription_item_id, requests_remaining, imagine_credits')
        .eq('user_id', userId)
        .single();
        
      if (error) {
        console.error('Error fetching subscription data:', error);
        setIsPaying(false);
        setTierQuota(null);
        setRequestsRemaining(null);
        setImagineCredits(null);
        setUserPlan('FREE');
        setStripeData({
          customerId: null,
          subscriptionId: null,
          subscriptionItemId: null
        });
        return;
      }
      
      // Destructure data once
      const { 
        stripe_subscription_id,
        tier_quota, 
        requests_remaining, 
        stripe_customer_id, 
        stripe_subscription_item_id,
        imagine_credits
      } = data;
      
      // Determine userPlan based on tier_quota
      let determinedPlan: TierType = 'FREE';
      if (tier_quota !== null && tier_quota !== undefined) {
        const sortedPlans = [...PRICING_PLANS].sort((a, b) => b.quota - a.quota);
        for (const plan of sortedPlans) {
          if (tier_quota >= plan.quota) {
            determinedPlan = plan.name.toUpperCase() as TierType;
            break;
          }
        }
      }
      setUserPlan(determinedPlan);
      
      // Set all states using the destructured values
      setIsPaying(stripe_subscription_id !== null && stripe_subscription_id !== "" && stripe_subscription_id !== undefined);
      setTierQuota(tier_quota ?? null);
      setRequestsRemaining(requests_remaining ?? null);
      setImagineCredits(imagine_credits ?? null);
      setStripeData({
        customerId: stripe_customer_id ?? null,
        subscriptionId: stripe_subscription_id ?? null,
        subscriptionItemId: stripe_subscription_item_id ?? null
      });
      
    } catch (err) {
      console.error('Failed to fetch subscription data:', err);
      setIsPaying(false);
      setTierQuota(null);
      setRequestsRemaining(null);
      setImagineCredits(null);
      setUserPlan('FREE');
      setStripeData({
        customerId: null,
        subscriptionId: null,
        subscriptionItemId: null
      });
    }
  };

  // Function to refresh subscription data for the current user
  const refreshSubscription = async () => {
    if (!user) return;
    await fetchSubscriptionData(user.id);
  };

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      // Fetch subscription data if user is logged in
      if (currentUser) {
        fetchSubscriptionData(currentUser.id);
      }
      
      setLoading(false);
      
      // Save token from initial session check
      saveTokenToBackend(session?.access_token);
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      // Fetch subscription data if user is logged in
      if (currentUser) {
        fetchSubscriptionData(currentUser.id);
      } else {
        setIsPaying(false);
        setTierQuota(null);
        setRequestsRemaining(null);
        setImagineCredits(null);
        setUserPlan('FREE');
        setStripeData({ customerId: null, subscriptionId: null, subscriptionItemId: null });
      }
      
      setLoading(false);
      
      // Save token when auth state changes
      saveTokenToBackend(session?.access_token);
    });

    // Handle OAuth redirect
    const handleAuthRedirect = async (url: string) => {
      console.log('Auth callback received:', url); // Debug log
      
      try {
        const urlObj = new URL(url);
        
        // First check for authorization code in search params
        const code = urlObj.searchParams.get('code');
        if (code) {
          console.log('Authorization code flow detected');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('Error exchanging code for session:', error);
            setAuthError(error.message);
            throw error;
          }
          return;
        }

        // If no code, check for access token in hash fragment
        const hashParams = new URLSearchParams(urlObj.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        if (accessToken) {
          console.log('Implicit flow detected');
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: hashParams.get('refresh_token') || '',
          });
          if (error) {
            console.error('Error setting session:', error);
            setAuthError(error.message);
            throw error;
          }
          return;
        }

        // Check for error_description in URL params
        const errorDescription = urlObj.searchParams.get('error_description');
        if (errorDescription) {
          console.error('Authentication error:', errorDescription);
          
          // Check for specific error about unverified email
          if (errorDescription.replace(/\+/g, ' ') === 'Error getting user email from external provider') {
            const errorMsg = 'Your Discord account needs a verified email address. Please verify your email in Discord and try again.';
            setAuthError(errorMsg);
            throw new Error(errorMsg);
          }
          
          setAuthError(errorDescription.replace(/\+/g, ' '));
          throw new Error(errorDescription);
        }

        // If we get here, there's no auth credentials and no error description
        const errorMsg = 'No authentication credentials found in callback URL';
        console.error(errorMsg);
        setAuthError(errorMsg);
        throw new Error(errorMsg);
      } catch (err) {
        console.error('Error handling auth redirect:', err);
        if (err instanceof Error && !authError) {
          setAuthError(err.message);
        }
        throw err;
      }
    };

    // Listen for auth callback from main process only in Electron
    if (ipcRenderer) {
      ipcRenderer.on('auth-callback', (_event: IpcRendererEvent, url: string) => {
        handleAuthRedirect(url).catch(err => {
          console.error('Failed to handle auth callback:', err);
        });
      });
    }

    return () => {
      subscription.unsubscribe();
      if (ipcRenderer) {
        ipcRenderer.removeAllListeners('auth-callback');
      }
    };
  }, []);

  // Function to get customer portal URL (moved from AccountModal)
  const getCustomerPortal = async (action?: 'cancel' | 'update') => {
    if (!stripeData.customerId) {
      throw new Error('No customer ID found. Please contact support.');
    }

    if (action && !stripeData.subscriptionId) {
      throw new Error('No subscription ID found. Please contact support.');
    }

    // Call the backend API to get customer portal URL
    const response = await fetch(`${HTTPS_BACKEND_URL}/api/customer-portal/${stripeData.customerId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.message || 
        `Failed to get customer portal URL (${response.status})`
      );
    }

    const { url } = await response.json();

    // Append the appropriate path if we're handling a subscription action
    let finalUrl = url;
    if (action && stripeData.subscriptionId) {
      finalUrl = `${url}/subscriptions/${stripeData.subscriptionId}/${action}`;
    }

    // Open the portal URL in external browser
    if (shell) {
      shell.openExternal(finalUrl);
    } else {
      // For non-Electron environments, you might want to redirect or log
      console.log('Customer Portal URL (non-Electron):', finalUrl);
      // window.location.href = finalUrl; // Example for browser redirect
      throw new Error('Customer portal can only be opened automatically in the desktop app.');
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const signInWithProvider = async (provider: 'discord' | 'google') => {
    if (!shell) {
      throw new Error(`Cannot sign in with ${provider} outside of Electron`);
    }

    const oauthUrl = `${SUPABASE_URL}/auth/v1/authorize?` + 
      new URLSearchParams({
        provider,
        redirect_to: 'minepal://auth/callback',
        close_tab: 'true'
      }).toString();

    await shell.openExternal(oauthUrl);
  };

  const value: SupabaseContextType = {
    supabase,
    user,
    loading,
    isPaying,
    tierQuota,
    requestsRemaining,
    imagineCredits,
    stripeData,
    signOut,
    signInWithProvider,
    refreshSubscription,
    authError,
    clearAuthError,
    userPlan,
    getCustomerPortal,
  };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
} 