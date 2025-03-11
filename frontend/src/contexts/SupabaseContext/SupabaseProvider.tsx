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

interface SupabaseProviderProps {
  children: ReactNode;
}

export default function SupabaseProvider({ children }: SupabaseProviderProps) {
  const [supabase] = useState<SupabaseClient>(() => 
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [tierQuota, setTierQuota] = useState<number | null>(null);
  const [requestsRemaining, setRequestsRemaining] = useState<number | null>(null);
  const [stripeData, setStripeData] = useState<StripeData>({
    customerId: null,
    subscriptionId: null,
    subscriptionItemId: null
  });

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
            throw error;
          }
          return;
        }

        console.error('No authentication credentials found in callback URL');
      } catch (err) {
        console.error('Error handling auth redirect:', err);
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
  }, [supabase]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const signInWithDiscord = async () => {
    if (!shell) {
      throw new Error('Cannot sign in with Discord outside of Electron');
    }

    const oauthUrl = `${SUPABASE_URL}/auth/v1/authorize?` + 
      new URLSearchParams({
        provider: 'discord',
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
    signInWithDiscord,
    refreshSubscription,
  };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
} 