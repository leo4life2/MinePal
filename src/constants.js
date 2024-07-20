const PROD_BACKEND_HOST = 'backend.minepal.net:11111';
const LOCAL_BACKEND_HOST = 'localhost:11111'
const BACKEND_HOST = process.env.LOCAL_TEST === 'true' ? LOCAL_BACKEND_HOST : PROD_BACKEND_HOST;
const WSS_BACKEND_URL = process.env.LOCAL_TEST === 'true' ? `ws://${BACKEND_HOST}` : `wss://${BACKEND_HOST}`;
const HTTPS_BACKEND_URL = process.env.LOCAL_TEST === 'true' ? `http://${BACKEND_HOST}` : `https://${BACKEND_HOST}`;


export { WSS_BACKEND_URL, HTTPS_BACKEND_URL };