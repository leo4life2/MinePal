import React from 'react';
import Profiles from './Profiles'; // Import the Profiles component

function Settings({ settings, handleSettingChange, settingNotes, showAdvanced, setShowAdvanced, newProfile, setNewProfile, addProfile, removeProfile }) {
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
        <label htmlFor="load_memory">
          load memory:
          {settingNotes.load_memory && <span className="setting-note"> ({settingNotes.load_memory})</span>}
        </label>
        <label className="switch">
          <input
            type="checkbox"
            id="load_memory"
            checked={settings.load_memory}
            onChange={(e) => handleSettingChange('load_memory', e.target.checked)}
          />
          <span className="slider"></span>
        </label>
      </div>
      <div className="setting-item">
        <label htmlFor="port">
          port:
          {settingNotes.port && <span className="setting-note"> ({settingNotes.port})</span>}
        </label>
        <input
          id="port"
          type="number"
          value={settings.port}
          onChange={(e) => handleSettingChange('port', e.target.value)}
        />
      </div>
      <div className="advanced-settings">
        <button onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
        </button>
        {showAdvanced && (
          <div className="advanced-settings-content">
            <div className="setting-item">
              <label htmlFor="host">
                host:
                {settingNotes.host && <span className="setting-note"> ({settingNotes.host})</span>}
              </label>
              <input
                id="host"
                type="text"
                value={settings.host}
                onChange={(e) => handleSettingChange('host', e.target.value)}
              />
            </div>
            {Object.entries(settings).map(([key, value]) => {
              if (key !== 'player_username' && key !== 'host' && key !== 'port' && key !== 'profiles' && key !== 'load_memory') {
                return (
                  <div key={key} className="setting-item">
                    <label htmlFor={key}>
                      {key.replace(/_/g, ' ')}:
                      {settingNotes[key] && <span className="setting-note"> ({settingNotes[key]})</span>}
                    </label>
                    {typeof value === 'boolean' ? (
                      <label className="switch">
                        <input
                          type="checkbox"
                          id={key}
                          checked={value}
                          onChange={(e) => handleSettingChange(key, e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                    ) : (
                      <input
                        id={key}
                        type={key === 'code_timeout_mins' ? 'number' : 'text'}
                        value={value}
                        onChange={(e) => handleSettingChange(key, e.target.value)}
                      />
                    )}
                  </div>
                );
              }
              return null;
            })}
            <div className="setting-item">
              <Profiles
                settings={settings}
                newProfile={newProfile}
                setNewProfile={setNewProfile}
                addProfile={addProfile}
                removeProfile={removeProfile}
                settingNotes={settingNotes}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;