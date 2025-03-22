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
    "key_binding",
    "language",
    "openai_api_key",
    "model",
    "useOwnApiKey",
    "input_device_id"
  ];

  const filteredSettings = expectedFields.reduce<UserSettings>((acc, fieldName) => ({
    ...acc,
    [fieldName]: data[fieldName],
  }), defaultUserSettings);

  // Filter profiles to include fields we need
  if (filteredSettings.profiles) {
    filteredSettings.profiles = filteredSettings.profiles.map(profile => ({
      name: profile.name,
      personality: profile.personality,
      autoMessage: profile.autoMessage || '',
      triggerOnJoin: !!profile.triggerOnJoin,
      triggerOnRespawn: !!profile.triggerOnRespawn
    }));
  }
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

export interface Memory {
    id: string;
    text: string;
}

export async function fetchBotMemories(botName: string): Promise<Memory[]> {
    const response = await fetch(`${settings.API_BASE_URL}/bot-memories?name=${encodeURIComponent(botName)}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch memories: ${response.statusText}`);
    }
    return response.json();
}

export async function deleteMemory(botName: string, memoryId: string): Promise<void> {
    const response = await fetch(`${settings.API_BASE_URL}/bot-memories/${encodeURIComponent(botName)}/${encodeURIComponent(memoryId)}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`Failed to delete memory: ${response.statusText}`);
    }
}
