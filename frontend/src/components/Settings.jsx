import Profiles from './Profiles';
import './Settings.css';

function Settings({ settings, setSettings, handleSettingChange, settingNotes, selectedProfiles, handleProfileSelect, api }) {
  return (
    <div className="settings">
      <div className="setting-item">
        <label htmlFor="player_username">
          player username:
          {settingNotes.player_username && <span className="setting-note"> ({settingNotes.player_username})</span>}
        </label>
        <input
          id="player_username"
          type="text"
          className="setting-input"
          value={settings.player_username}
          onChange={(e) => handleSettingChange('player_username', e.target.value)}
        />
      </div>
      <div className="setting-item">
        <label htmlFor="host">
          host : port:
          {settingNotes.host && <span className="setting-note"> ({settingNotes.host})</span>}
        </label>
        <div>
          <input
            id="host"
            type="text"
            className="setting-input"
            value={settings.host}
            onChange={(e) => handleSettingChange('host', e.target.value)}
          />
          <span style={{ margin: '0 8px' }}>:</span>
          <input
            id="port"
            type="number"
            className="setting-input"
            value={settings.port}
            onChange={(e) => handleSettingChange('port', e.target.value)}
          />
        </div>
      </div>
      <div className="setting-item">
        <label htmlFor="minecraft_version">
          minecraft version:
          {settingNotes.minecraft_version && <span className="setting-note"> ({settingNotes.minecraft_version})</span>}
        </label>
        <input
          id="minecraft_version"
          type="text"
          className="setting-input"
          value={settings.minecraft_version}
          onChange={(e) => handleSettingChange('minecraft_version', e.target.value)}
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
            checked={settings.whisper_to_player}
            onChange={(e) => handleSettingChange('whisper_to_player', e.target.checked)}
          />
          <span className="slider"></span>
        </label>
      </div>
      <label htmlFor="profiles">
          your pals:
          {settingNotes.pal_message && <span className="setting-note"> ({settingNotes.pal_message})</span>}
      </label>
      <Profiles
        profiles={settings.profiles}
        setSettings={setSettings}
        handleProfileSelect={handleProfileSelect}
        selectedProfiles={selectedProfiles}
        api={api}
      />
    </div>
  );
}

export default Settings;