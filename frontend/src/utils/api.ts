import { Profile, UserSettings } from '../types/apiTypes';
import defaultUserSettings from './defaultUserSettings';
import settings from './settings';

export async function fetchAgentStatus(): Promise<boolean> {
  const response = await fetch(`${settings.API_BASE_URL}/agent-status`);
  const { agentStarted } = await response.json();

  return agentStarted;
}

export async function fetchBackendAlive() {
  const response = await fetch(`${settings.API_BASE_URL}/backend-alive`);
  const data = await response.json();
  if (!data.backend_alive) {
    throw new Error("Backend is down.");
  }
}

export async function checkServerAlive(host: string, port: number) {
  const response = await fetch(`${settings.API_BASE_URL}/check-server?host=${host}&port=${port}`);
  const { alive } = await response.json();

  return alive;
}

export async function fetchSettings() {
  const response = await fetch(`${settings.API_BASE_URL}/settings`);
  const data = await response.json();
  const expectedFields = [
    "minecraft_version",
    "host",
    "port",
    "player_username",
    "profiles",
    "whisper_to_player",
    "voice_mode",
    "key_binding",
    "language",
    "openai_api_key",
    "model",
    "useOwnApiKey",
  ];

  const filteredSettings = expectedFields.reduce<UserSettings>((acc, fieldName) => ({
    ...acc,
    [fieldName]: data[fieldName],
  }), defaultUserSettings);

  // Filter profiles to only include name and personality fields
  if (filteredSettings.profiles) {
    filteredSettings.profiles = filteredSettings.profiles.map(profile => ({
      name: profile.name,
      personality: profile.personality
    }));
  }

  console.log("filtered settings", filteredSettings);

  return filteredSettings;
}

export async function sendMessage(botName: string, message: string) {
  await fetch(`${settings.API_BASE_URL}/manual-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ botName, message }),
  });
}

export async function saveProfiles(profiles: Profile[]) {
  await fetch(`${settings.API_BASE_URL}/save-profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profiles }),
  });
}

export async function startAgent(userSettings: UserSettings): Promise<boolean> {
  const response = await fetch(`${settings.API_BASE_URL}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userSettings),
  });

  return response.ok;
}

export async function stopAgent(): Promise<boolean> {
  const response = await fetch(`${settings.API_BASE_URL}/stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  return response.ok;
}

export async function getAnnouncements(): Promise<string> {
  const response = await fetch('https://minepal.net/announcement.txt');
  const data = await response.text();
  return data;
}
