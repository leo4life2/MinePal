const PROD_BACKEND_HOST = 'api.minepal.net';
const DEV_BACKEND_HOST = 'staging.minepal.net';
const BACKEND_HOST = process.env.NODE_ENV === 'dev' ? DEV_BACKEND_HOST : PROD_BACKEND_HOST;
const HTTPS_BACKEND_URL = `https://${BACKEND_HOST}`;

export { HTTPS_BACKEND_URL };