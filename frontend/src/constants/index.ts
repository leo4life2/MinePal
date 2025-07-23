// Supabase Configuration
// These are public keys - they are meant to be exposed to the client
// The security comes from proper Row Level Security (RLS) policies in Supabase
export const SUPABASE_URL = 'https://wwcgmpbfypiagjfeixmn.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Y2dtcGJmeXBpYWdqZmVpeG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNjEzNjksImV4cCI6MjA2MjkzNzM2OX0.Lx_uFpAikE8nC51d9OnxGiRkORWQNm9-BSyqGx4vSTk'; 

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
  imagineCredits?: number; // Adding imagine credits per month
}

const TEST_PRICING_PLANS: PricingPlan[] = [
  {
    id: 1,
    name: 'Basic',
    price: 2.99,
    quota: 1800,
    priceId: 'price_1R0YEFAbdM8AcunxnUxj07sw',
    features: [],
    imagineCredits: 1
  },
  {
    id: 2,
    name: 'Standard',
    price: 7.99,
    quota: 5400,
    priceId: 'price_1R0YFHAbdM8AcunxY1rm8fkw',
    features: ['Pal Voice'],
    imagineCredits: 3
  },
  {
    id: 3,
    name: 'Pro',
    price: 13.99,
    quota: 10500,
    priceId: 'price_1R0YFYAbdM8AcunxKH04jHck',
    features: ['Pal Voice'],
    imagineCredits: 6
  }
];

const LIVE_PRICING_PLANS: PricingPlan[] = [
  {
    id: 1,
    name: 'Basic',
    price: 2.99,
    quota: 1800,
    priceId: 'price_1R2MrRAbdM8AcunxfX4snQNi',
    features: [],
    imagineCredits: 1
  },
  {
    id: 2,
    name: 'Standard',
    price: 7.99,
    quota: 5400,
    priceId: 'price_1R2MrTAbdM8AcunxqGPVw0ZR',
    features: ['Pal Voice'],
    imagineCredits: 3
  },
  {
    id: 3,
    name: 'Pro',
    price: 13.99,
    quota: 10500,
    priceId: 'price_1R2MrVAbdM8AcunxMUql3BtU',
    features: ['Pal Voice'],
    imagineCredits: 6
  }
];

export const PRICING_PLANS = import.meta.env.DEV ? TEST_PRICING_PLANS : LIVE_PRICING_PLANS;

// Imagine Credit Packages
export interface CreditPackage {
  id: number;
  name: string;
  credits: number;
  price: number;
  priceId?: string; // Stripe price ID (optional for now)
}

const TEST_IMAGINE_CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 1,
    name: 'Starter Pack',
    credits: 20,
    price: 9,
    priceId: 'price_1RnqUWAbdM8Acunxi3YPjgZ9',
  },
  {
    id: 2,
    name: 'Popular Pack',
    credits: 60,
    price: 24,
    priceId: 'price_1RnqV2AbdM8Acunx6kCFk8ZU',
  },
  {
    id: 3,
    name: 'Mega Pack',
    credits: 150,
    price: 45,
    priceId: 'price_1RnqVSAbdM8AcunxHdTTNzee',
  }
];

const LIVE_IMAGINE_CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 1,
    name: 'Starter Pack',
    credits: 20,
    price: 9,
    priceId: 'price_1RnttcAbdM8AcunxmN7rNkG9',
  },
  {
    id: 2,
    name: 'Popular Pack',
    credits: 60,
    price: 24,
    priceId: 'price_1RntteAbdM8AcunxhzRV4qFn',
  },
  {
    id: 3,
    name: 'Mega Pack',
    credits: 150,
    price: 45,
    priceId: 'price_1RntthAbdM8Acunx3ciCxEZ5',
  }
];

export const IMAGINE_CREDIT_PACKAGES = import.meta.env.DEV ? TEST_IMAGINE_CREDIT_PACKAGES : LIVE_IMAGINE_CREDIT_PACKAGES;

const PROD_BACKEND_HOST = 'api.minepal.net';
const DEV_BACKEND_HOST = 'staging.minepal.net:11111';
const BACKEND_HOST = import.meta.env.DEV ? DEV_BACKEND_HOST : PROD_BACKEND_HOST;
export const HTTPS_BACKEND_URL = `https://${BACKEND_HOST}`;
