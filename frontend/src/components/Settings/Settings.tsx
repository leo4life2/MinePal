import { useState, useEffect } from 'react';
import { Settings as SettingsIcon } from 'react-feather';
import { useUserSettings } from '../../contexts/UserSettingsContext/UserSettingsContext';
import supportedLocales from '../../utils/supportedLocales';
import { minecraftVersions } from '../../utils/minecraftVersions';
import { useAgent } from '../../contexts/AgentContext/AgentContext';
import './Settings.css';

function Settings() {
  const { userSettings, updateField } = useUserSettings();
  const { agentActive } = useAgent();
  const [isExpanded, setIsExpanded] = useState(false);
  const [gameMode, setGameMode] = useState('singleplayer');
  
  // Safely access host using a defensive approach
  useEffect(() => {
    const currentHost = userSettings.host || '';
    setGameMode(currentHost === 'localhost' ? 'singleplayer' : 'multiplayer');
  }, [userSettings]);

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
            <label htmlFor="player_username" className="input-label">
              Minecraft Username
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
            <label className="input-label">Game Mode</label>
            <div className="game-mode-selector">
              <button
                className={`mode-button ${gameMode === 'singleplayer' ? 'active' : ''}`}
                onClick={() => handleGameModeChange('singleplayer')}
              >
                Singleplayer
              </button>
              <button
                className={`mode-button ${gameMode === 'multiplayer' ? 'active' : ''}`}
                onClick={() => handleGameModeChange('multiplayer')}
              >
                Multiplayer
              </button>
            </div>
          </div>

          {gameMode === 'multiplayer' && (
            <div className="setting-item">
              <label htmlFor="host" className="input-label">
                Server Address
              </label>
              <input
                id="host"
                type="text"
                className="setting-input"
                value={userSettings.host || ''}
                onChange={(e) => updateField('host', e.target.value)}
              />
            </div>
          )}

          <div className="setting-item">
            <label htmlFor="port" className="input-label">
              Port
            </label>
            <input
              id="port"
              className="setting-input"
              value={userSettings.port}
              onChange={(e) => updateField('port', parseInt(e.target.value, 10) || "")}
            />
          </div>

          <div className="setting-item">
            <label htmlFor="minecraft_version" className="input-label">
              Minecraft Version
            </label>
            <select
              id="minecraft_version"
              value={userSettings.minecraft_version}
              onChange={(e) => {
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
            <label htmlFor="language" className="input-label">Language/Accent</label>
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
            <label htmlFor="whisper_to_player" className="input-label">
              Whisper To Player
            </label>
            <div className="switch-container">
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
        </div>
      )}
    </div>
  );
}

export default Settings; 