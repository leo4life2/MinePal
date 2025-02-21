import { useState } from 'react';
import { Settings as SettingsIcon } from 'react-feather';
import { useUserSettings } from '../../contexts/UserSettingsContext/UserSettingsContext';
import settingNotes from '../../utils/settingsNotes';
import supportedLocales from '../../utils/supportedLocales';
import { minecraftVersions } from '../../utils/minecraftVersions';
import { useAgent } from '../../contexts/AgentContext/AgentContext';
import './Settings.css';

function Settings() {
  const { userSettings, updateField } = useUserSettings();
  const { agentActive } = useAgent();
  const [isExpanded, setIsExpanded] = useState(false);
  const [gameMode, setGameMode] = useState(userSettings.host === 'localhost' ? 'singleplayer' : 'multiplayer');

  const handleGameModeChange = (mode: 'singleplayer' | 'multiplayer') => {
    setGameMode(mode);
    if (mode === 'singleplayer') {
      updateField('host', 'localhost');
    }
  };

  return (
    <div className="settings-container">
      <button 
        className="settings-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <SettingsIcon size={18} />
        <span>Settings</span>
        <div className={`arrow ${isExpanded ? 'expanded' : ''}`}>▼</div>
      </button>

      {isExpanded && (
        <div className="settings-content">
          <div className="setting-item">
            <label htmlFor="player_username">
              player username:
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
            <div className="game-mode-selector">
              <button
                className={`mode-button ${gameMode === 'singleplayer' ? 'active' : ''}`}
                onClick={() => handleGameModeChange('singleplayer')}
              >
                singleplayer
              </button>
              <button
                className={`mode-button ${gameMode === 'multiplayer' ? 'active' : ''}`}
                onClick={() => handleGameModeChange('multiplayer')}
              >
                multiplayer
              </button>
            </div>
          </div>

          <div className="setting-item">
            <label htmlFor="host">
              host:
              {settingNotes.host && <span className="setting-note"> ({settingNotes.host})</span>}
            </label>
            <input
              id="host"
              type="text"
              className={`setting-input ${gameMode === 'singleplayer' ? 'disabled' : ''}`}
              value={userSettings.host}
              onChange={(e) => updateField('host', e.target.value)}
              disabled={gameMode === 'singleplayer'}
            />
          </div>

          <div className="setting-item">
            <label htmlFor="port">
              port:
            </label>
            <input
              id="port"
              type="number"
              className="setting-input"
              value={userSettings.port}
              onChange={(e) => updateField('port', e.target.value)}
            />
          </div>

          <div className="setting-item">
            <label htmlFor="minecraft_version">
              minecraft version:
              {settingNotes.minecraft_version && <span className="setting-note"> ({settingNotes.minecraft_version})</span>}
            </label>
            <select
              id="minecraft_version"
              value={userSettings.minecraft_version}
              onChange={(e) => {
                console.log('Selected Minecraft version:', e.target.value);
                updateField('minecraft_version', e.target.value);
              }}
              className="setting-input"
            >
              {minecraftVersions.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.versions.map((version) => (
                    <option key={version} value={version}>
                      {version}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="setting-item">
            <label htmlFor="language">language/accent:</label>
            <select
              id="language"
              value={userSettings.language}
              onChange={(e) => updateField('language', e.target.value)}
              disabled={agentActive}
              className="setting-input"
            >
              {supportedLocales.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="setting-item">
            <label htmlFor="whisper_to_player">
              whisper to player:
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
      )}
    </div>
  );
}

export default Settings; 