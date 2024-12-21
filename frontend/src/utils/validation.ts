import { UserSettings } from "../types/apiTypes";

export function isValidMinecraftUsername(username: string) {
  const regex = /^[a-zA-Z0-9_]{3,16}$/;
  return regex.test(username);
}

export function validateUserSettings({
  useOwnApiKey,
  openai_api_key,
  model,
  profiles,
  key_binding,
  voice_mode,
  host,
  minecraft_version,
  port,
}: UserSettings) {
  const invalidFields: string[] = [];

  if (useOwnApiKey && !(openai_api_key && model)) {
    if (!openai_api_key) invalidFields.push("openai_api_key");
    if (!model) invalidFields.push("model");
  }

  if (!profiles.length) invalidFields.push("profiles");
  if (!key_binding && !["always_on", "off"].includes(voice_mode)) invalidFields.push("key_binding");
  if (!host) invalidFields.push("host");
  if (!port) invalidFields.push("port");
  if (!minecraft_version || minecraft_version.split(".").length !== 3) invalidFields.push("minecraft_version");

  return invalidFields;
}
