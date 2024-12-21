import { UserSettings, VoiceMode } from "../types/apiTypes";

const defaultUserSettings: UserSettings = {
  minecraft_version: "",
  host: "",
  port: 0,
  player_username: "",
  profiles: [],
  whisper_to_player: false,
  voice_mode: VoiceMode.AlwaysOn,
  key_binding: '',
  language: 'en',
  openai_api_key: '',
  model: '',
  useOwnApiKey: false
};

export default defaultUserSettings;
