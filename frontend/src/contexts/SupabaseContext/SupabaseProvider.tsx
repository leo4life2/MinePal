import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { ReactNode, useEffect, useState } from 'react';
import { SupabaseContext, SupabaseContextType } from './SupabaseContext';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/supabase';
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

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Save token from initial session check
      saveTokenToBackend(session?.access_token);
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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
    signOut,
    signInWithDiscord
  };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
} 