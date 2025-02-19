import { SupabaseClient, User } from '@supabase/supabase-js';
import { createContext } from 'react';

export interface SupabaseContextType {
  supabase: SupabaseClient;
  user: User | null;
  loading: boolean;
  signInWithDiscord: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined); 