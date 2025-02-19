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

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Handle OAuth redirect
    const handleAuthRedirect = async (url: string) => {
      console.log('Auth callback received:', url); // Debug log
      
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        
        if (!code) {
          console.error('No code found in callback URL');
          return;
        }

        // Exchange the code for a session
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('Error exchanging code for session:', error);
          throw error;
        }
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
        redirect_to: 'minepal://auth/callback'
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