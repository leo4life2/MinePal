import './Settings.css';
import { useUserSettings } from '../contexts/UserSettingsContext/UserSettingsContext';
import settingNotes from '../utils/settingsNotes';

function Settings() {
  const { userSettings, updateField } = useUserSettings();

  return (
    <div className="settings">
      <div className="setting-item">
        <label htmlFor="player_username">
          Player username:
          {settingNotes.player_username && <span className="setting-note"> ({settingNotes.player_username})</span>}
        </label>
        <input
          id="player_username"
          type="text"
          className="setting-input"
          value={userSettings.player_username}
          onChange={(e) => updateField('player_username', e.target.value)}
        />
      </div>
      <div className="setting-item">
        <label htmlFor="host">
          Host : port:
          {settingNotes.host && <span className="setting-note"> ({settingNotes.host})</span>}
        </label>
        <div>
          <input
            id="host"
            type="text"
            className="setting-input"
            value={userSettings.host}
            onChange={(e) => updateField('host', e.target.value)}
          />
          <span style={{ margin: '0 8px' }}>:</span>
          <input
            id="port"
            type="number"
            className="setting-input"
            value={userSettings.port}
            onChange={(e) => updateField('port', e.target.value)}
          />
        </div>
      </div>
      <div className="setting-item">
        <label htmlFor="minecraft_version">
          Minecraft version:
          {settingNotes.minecraft_version && <span className="setting-note"> ({settingNotes.minecraft_version})</span>}
        </label>
        <input
          id="minecraft_version"
          type="text"
          className="setting-input"
          value={userSettings.minecraft_version}
          onChange={(e) => updateField('minecraft_version', e.target.value)}
        />
      </div>
      <div className="setting-item">
        <label htmlFor="whisper_to_player">
          Whisper to Player:
        </label>
        <label className="switch">
          <input
            id="whisper_to_player"
            type="checkbox"
            checked={userSettings.whisper_to_player}
            onChange={(e) => updateField('whisper_to_player', e.target.checked)}
          />
          <span className="slider"></span>
        </label>
      </div>
    </div>
  );
}

export default Settings;
