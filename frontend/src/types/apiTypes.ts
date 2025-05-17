export interface Profile {
  name: string;
  personality: string;
  autoMessage?: string;
  triggerOnJoin?: boolean;
  triggerOnRespawn?: boolean;
  enable_voice?: boolean;
  base_voice_id?: string;
  voice_only_mode?: boolean;
  enable_rare_finds?: boolean;
  enable_entity_sleep?: boolean;
  enable_entity_hurt?: boolean;
  enable_silence_timer?: boolean;
  enable_weather_listener?: boolean;
  allow_self_prompting?: boolean;
}

export type OpenAIModel = "gpt-4o-mini" | "gpt-4o";

export type UserSettings = {
  host: string;
  port: number;
  player_username: string;
  profiles: Profile[];
  whisper_to_player: boolean;
  key_binding: string;
  language: string;
  openai_api_key: string;
  model: string;
  useOwnApiKey: boolean;
  input_device_id: string;
};
