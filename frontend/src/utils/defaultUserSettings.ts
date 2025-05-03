import { UserSettings } from "../types/apiTypes";

const defaultUserSettings: UserSettings = {
  host: "",
  port: 0,
  player_username: "",
  profiles: [],
  whisper_to_player: false,
  voice_mode: true,
  key_binding: '',
  language: 'en',
  openai_api_key: '',
  model: '',
  useOwnApiKey: false,
  input_device_id: '',
};

export default defaultUserSettings;
