export interface Profile {
  name: string;
  personality: string;
  autoMessage?: string;
  triggerOnJoin?: boolean;
  triggerOnRespawn?: boolean;
}

export type OpenAIModel = "gpt-4o-mini" | "gpt-4o";

export type UserSettings = {
  minecraft_version: string;
  host: string;
  port: number;
  player_username: string;
  profiles: Profile[];
  whisper_to_player: boolean;
  voice_mode: boolean;
  key_binding: string;
  language: string;
  openai_api_key: string;
  model: string;
  useOwnApiKey: boolean;
  input_device_id: string;
};
