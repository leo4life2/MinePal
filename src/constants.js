const PROD_BACKEND_HOST = 'api.minepal.net';
const DEV_BACKEND_HOST = 'staging.minepal.net:11111';
const BACKEND_HOST = process.env.NODE_ENV === 'dev' ? DEV_BACKEND_HOST : PROD_BACKEND_HOST;
const HTTPS_BACKEND_URL = `https://${BACKEND_HOST}`;

const SUPABASE_URL = 'https://wwcgmpbfypiagjfeixmn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Y2dtcGJmeXBpYWdqZmVpeG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNjEzNjksImV4cCI6MjA2MjkzNzM2OX0.Lx_uFpAikE8nC51d9OnxGiRkORWQNm9-BSyqGx4vSTk'; 
const ACTION_SAMPLING_RATE = 0.2;

export { HTTPS_BACKEND_URL, SUPABASE_URL, SUPABASE_ANON_KEY, ACTION_SAMPLING_RATE };