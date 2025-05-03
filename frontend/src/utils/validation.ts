import { UserSettings } from "../types/apiTypes";

export function isValidMinecraftUsername(username: string) {
  const regex = /^[a-zA-Z0-9_]{3,16}$/;
  return regex.test(username);
}

export function isValidEmail(email: string) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function validateUserSettings({
  useOwnApiKey,
  openai_api_key,
  model,
  profiles,
  host,
  port,
}: UserSettings) {
  const invalidFields: string[] = [];

  if (useOwnApiKey && !(openai_api_key && model)) {
    if (!openai_api_key) invalidFields.push("openai_api_key");
    if (!model) invalidFields.push("model");
  }

  if (!profiles.length) invalidFields.push("profiles");
  if (!host) invalidFields.push("host");
  if (!port) invalidFields.push("port");

  return invalidFields;
}
