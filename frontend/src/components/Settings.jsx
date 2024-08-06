import Profiles from './Profiles';

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
          value={settings.player_username}
          onChange={(e) => handleSettingChange('player_username', e.target.value)}
        />
      </div>
      <div className="setting-item">
        <label htmlFor="host">
          host : port:
          {settingNotes.host && <span className="setting-note"> ({settingNotes.host})</span>}
        </label>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input
            id="host"
            type="text"
            value={settings.host}
            onChange={(e) => handleSettingChange('host', e.target.value)}
            style={{ flex: '0 0 80%' }}
          />
          <span style={{ margin: '0 8px' }}>:</span>
          <input
            id="port"
            type="number"
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
          value={settings.minecraft_version}
          onChange={(e) => handleSettingChange('minecraft_version', e.target.value)}
        />
      </div>
      <label htmlFor="profiles">
          your pals:
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