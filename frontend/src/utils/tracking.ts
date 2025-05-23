import mixpanel from 'mixpanel-browser';

mixpanel.init('a9bdd5c85dab5761be032f1c1650defa');

let startTime: number = 0;

export function startTrackingSession(username: string, botCount: number, isPaying: boolean, appVersion: string) {
  try {
    // Identify the user in Mixpanel
    mixpanel.identify(username);

    // Track the number of bots spawned
    mixpanel.track('Bots spawned', {
      distinct_id: username,
      bot_count: botCount,
      is_paying: isPaying,
      app_version: appVersion
    });

    startTime = Date.now();
  } catch {
    // Well that's just too bad eh
  }
}

export function stopTrackingSession(username: string, isPaying: boolean, appVersion: string) {
  try {
    const playTime = (Date.now() - startTime) / 1000; // in seconds
    mixpanel.track('Bot play time', {
      distinct_id: username,
      play_time: playTime,
      is_paying: isPaying,
      app_version: appVersion
    });
    startTime = 0;
  } catch {
    // Well that's just too bad eh
  }
}
