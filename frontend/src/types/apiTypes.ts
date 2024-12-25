export type Profile = {
  name: string;
  personality: string;
}

export enum VoiceMode {
  AlwaysOn = "always_on",
  PushToTalk = "push_to_talk",
  ToggleToTalk = "toggle_to_talk",
  Off = "off",
}

export type OpenAIModel = "gpt-4o-mini" | "gpt-4o";

export type UserSettings = {
  minecraft_version: string;
  host: string;
  port: number;
  player_username: string;
  profiles: Profile[];
  whisper_to_player: boolean;
  voice_mode: VoiceMode;
  key_binding: string;
  language: string;
  openai_api_key: string;
  model: string;
  useOwnApiKey: boolean;
};
