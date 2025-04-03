import { SupabaseClient, User } from '@supabase/supabase-js';
import { createContext } from 'react';

export interface StripeData {
  customerId: string | null;
  subscriptionId: string | null;
  subscriptionItemId: string | null;
}

export interface SupabaseContextType {
  supabase: SupabaseClient;
  user: User | null;
  loading: boolean;
  isPaying: boolean;
  tierQuota: number | null;
  requestsRemaining: number | null;
  stripeData: StripeData;
  authError: string | null;
  signInWithProvider: (provider: 'discord' | 'google') => Promise<void>;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  clearAuthError: () => void;
}

export const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined); 