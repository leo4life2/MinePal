// Supabase Configuration
// These are public keys - they are meant to be exposed to the client
// The security comes from proper Row Level Security (RLS) policies in Supabase
export const SUPABASE_URL = 'https://wwcgmpbfypiagjfeixmn.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Y2dtcGJmeXBpYWdqZmVpeG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMwNTMwNjAsImV4cCI6MjA0ODYyOTA2MH0.7L7IeDKmuSmI7qKLXgylmwihpM6sLsljv32FsK-sbf4'; 

// Tier type definition
export type TierType = 'FREE' | 'BASIC' | 'STANDARD' | 'PRO';

// Pricing Plans
export interface PricingPlan {
  id: number;
  name: string;
  price: number;
  quota: number;
  priceId: string; // Stripe price ID
  features?: string[]; // Adding features array
}

const TEST_PRICING_PLANS: PricingPlan[] = [
  {
    id: 1,
    name: 'Basic',
    price: 2.99,
    quota: 1800,
    priceId: 'price_1R0YEFAbdM8AcunxnUxj07sw',
    features: []
  },
  {
    id: 2,
    name: 'Standard',
    price: 7.99,
    quota: 5400,
    priceId: 'price_1R0YFHAbdM8AcunxY1rm8fkw',
    features: ['Pal Voice']
  },
  {
    id: 3,
    name: 'Pro',
    price: 13.99,
    quota: 10500,
    priceId: 'price_1R0YFYAbdM8AcunxKH04jHck',
    features: ['Pal Voice']
  }
];

const LIVE_PRICING_PLANS: PricingPlan[] = [
  {
    id: 1,
    name: 'Basic',
    price: 2.99,
    quota: 1800,
    priceId: 'price_1R2MrRAbdM8AcunxfX4snQNi',
    features: []
  },
  {
    id: 2,
    name: 'Standard',
    price: 7.99,
    quota: 5400,
    priceId: 'price_1R2MrTAbdM8AcunxqGPVw0ZR',
    features: ['Pal Voice']
  },
  {
    id: 3,
    name: 'Pro',
    price: 13.99,
    quota: 10500,
    priceId: 'price_1R2MrVAbdM8AcunxMUql3BtU',
    features: ['Pal Voice']
  }
];

export const PRICING_PLANS = process.env.NODE_ENV === 'dev' ? TEST_PRICING_PLANS : LIVE_PRICING_PLANS;

const PROD_BACKEND_HOST = 'api.minepal.net';
const DEV_BACKEND_HOST = 'staging.minepal.net:11111';
const BACKEND_HOST = process.env.NODE_ENV === 'dev' ? DEV_BACKEND_HOST : PROD_BACKEND_HOST;
export const HTTPS_BACKEND_URL = `https://${BACKEND_HOST}`;
