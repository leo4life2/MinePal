import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { ReactNode, useEffect, useState } from 'react';
import { SupabaseContext, SupabaseContextType, StripeData } from './SupabaseContext';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../constants';
import { IpcRendererEvent } from 'electron';

// Get electron IPC renderer if we're in electron
const isElectron = window && window.process && window.process.type;
const electron = isElectron ? window.require('electron') : null;
const ipcRenderer = electron?.ipcRenderer;
const shell = electron?.shell;

// --- START HACK: Throttle Supabase token refresh ---
let lastRefreshAttemptTimestamp = 0;
// Set a reasonable minimum interval, e.g., 60 seconds, 
// potentially longer if needed (like 5 minutes = 300000ms)
const MIN_REFRESH_INTERVAL_MS = 60 * 1000; 
// --- END HACK ---

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
    try { // Add try-catch for safety during override
        const originalCallRefreshToken = client.auth['_callRefreshToken'].bind(client.auth);

        // Important: Ensure this override happens *after* client initialization
        // but before any potential refresh calls. Usually placing it right after
        // createClient is sufficient.

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.auth['_callRefreshToken'] = async function(...args: any[]) {
          const now = Date.now();
          
          if (now - lastRefreshAttemptTimestamp < MIN_REFRESH_INTERVAL_MS) {
            console.warn(`Supabase Auth: Refresh token request throttled. Min interval: ${MIN_REFRESH_INTERVAL_MS}ms. Last attempt: ${new Date(lastRefreshAttemptTimestamp)}`);
            // Return the expected structure for a failed refresh or empty session
            // Adjust based on CallRefreshTokenResult type if it differs
             return { data: null, error: new Error('Refresh throttled client-side to prevent loop.') }; 
          }

          console.log(`Supabase Auth: Initiating refresh token request at: ${new Date(now)}`);
          lastRefreshAttemptTimestamp = now; // Record the start time of *this* attempt

          try {
              // Call the original function
              const result = await originalCallRefreshToken(...args);
              
              // Check if it was successful (adjust condition based on actual result structure)
              if (result && result.data && result.data.session) {
                   console.log(`Supabase Auth: Refresh token successful at: ${new Date()}`);
                   // Keep lastRefreshAttemptTimestamp as the time this successful attempt *started*
              } else {
                  // Refresh failed, allow the next attempt sooner by resetting timestamp?
                  // Or keep the timestamp to enforce cooldown even on failure?
                  // Let's reset to allow faster retry *if the server allows it*.
                  // The server's 429 will be the ultimate gatekeeper.
                  console.error('Supabase Auth: Refresh token attempt failed.', result ? result.error : 'No result');
                  // Resetting timestamp:
                  // lastRefreshAttemptTimestamp = 0; 
                  // OR Keep timestamp (safer against loops if server error is temporary):
                  // no change needed here, timestamp remains from the start of failed attempt
              }
              return result;
          } catch(e) {
               lastRefreshAttemptTimestamp = 0; // Reset on unexpected error
               console.error('Supabase Auth: Unexpected error during _callRefreshToken override:', e);
               throw e; // Re-throw original error
          }
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
  const [authError, setAuthError] = useState<string | null>(null);
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
        .select('stripe_subscription_id, tier_quota, stripe_customer_id, stripe_subscription_item_id, requests_remaining')
        .eq('user_id', userId)
        .single();
        
      if (error) {
        console.error('Error fetching subscription data:', error);
        setIsPaying(false);
        setTierQuota(null);
        setRequestsRemaining(null);
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
        stripe_subscription_item_id 
      } = data;
      
      // Set all states using the destructured values
      setIsPaying(stripe_subscription_id !== null && stripe_subscription_id !== "" && stripe_subscription_id !== undefined);
      setTierQuota(tier_quota ?? null);
      setRequestsRemaining(requests_remaining ?? null);
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
        setIsPaying(false); // Reset isPaying when user logs out
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
    stripeData,
    signOut,
    signInWithProvider,
    refreshSubscription,
    authError,
    clearAuthError,
  };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
} 