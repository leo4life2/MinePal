import { notarize } from '@electron/notarize';

export default async function afterSign(context) {
  if (process.env.SKIP_AFTER_SIGN) {
    console.log("Skipping afterSign step for local build.");
    return;
  }
  
  const { appOutDir, electronPlatformName } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  await notarize({
    appPath: `${appOutDir}/${appName}.app`,
    appleApiKey: '~/private_keys/notarize.p8', // Path to your .p8 file
    appleApiKeyId: process.env.API_KEY_ID,
    appleApiIssuer: process.env.API_KEY_ISSUER_ID,
  });
}