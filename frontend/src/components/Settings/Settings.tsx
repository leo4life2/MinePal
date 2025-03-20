import { useState, useEffect, ReactNode } from 'react';
import { Settings as SettingsIcon, ChevronDown } from 'react-feather';
import { useUserSettings } from '../../contexts/UserSettingsContext/UserSettingsContext';
import supportedLocales from '../../utils/supportedLocales';
import { minecraftVersions } from '../../utils/minecraftVersions';
import { useAgent } from '../../contexts/AgentContext/AgentContext';
import useInputDevices from '../../hooks/useInputDevices';
import './Settings.css';

interface SettingsSectionProps {
  title: string;
  isExpanded?: boolean;
  children: ReactNode;
}

// Settings section component
function SettingsSection({ title, isExpanded: defaultExpanded = false, children }: SettingsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className="settings-section">
      <button 
        className={`section-toggle ${isExpanded ? 'expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span>{title}</span>
        <ChevronDown className={`arrow ${isExpanded ? 'expanded' : ''}`} size={16} strokeWidth={2.5} />
      </button>
      
      {isExpanded && (
        <div className="section-content">
          {children}
        </div>
      )}
    </div>
  );
}

function Settings() {
  const { userSettings, updateField } = useUserSettings();
  const { agentActive } = useAgent();
  const { inputDevices } = useInputDevices();
  const [isExpanded, setIsExpanded] = useState(false);
  const [gameMode, setGameMode] = useState('singleplayer');
  const [selectedDevice, setSelectedDevice] = useState<MediaDeviceInfo>();
  
  // Safely access host using a defensive approach
  useEffect(() => {
    const currentHost = userSettings.host || '';
    setGameMode(currentHost === 'localhost' ? 'singleplayer' : 'multiplayer');
  }, [userSettings]);

  // Initialize selected device when inputDevices are loaded
  useEffect(() => {
    if (inputDevices.length && !selectedDevice) {
      setSelectedDevice(inputDevices[0]);
      // Optionally: Store device ID in user settings if needed
      // updateField('input_device_id', inputDevices[0].deviceId);
    }
  }, [inputDevices, selectedDevice]);

  const handleGameModeChange = (mode: 'singleplayer' | 'multiplayer') => {
    setGameMode(mode);
    if (mode === 'singleplayer') {
      updateField('host', 'localhost');
    } else if (mode === 'multiplayer' && userSettings.host === 'localhost') {
      // Clear the localhost default when switching to multiplayer
      updateField('host', '');
    }
  };

  const handleInputDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    const device = inputDevices.find(d => d.deviceId === deviceId);
    if (device) {
      setSelectedDevice(device);
      // Optionally: Store device ID in user settings if needed
      // updateField('input_device_id', deviceId);
    }
  };

  return (
    <div className="settings-container">
      <button 
        className={`settings-toggle ${isExpanded ? 'expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <SettingsIcon size={18} />
        <span>Settings</span>
        <ChevronDown className={`arrow ${isExpanded ? 'expanded' : ''}`} size={20} strokeWidth={2.5} />
      </button>

      {isExpanded && (
        <div className="settings-content">
          <SettingsSection title="Basic" isExpanded={true}>
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
                placeholder="Enter username"
                disabled={agentActive}
              />
            </div>

            <div className="setting-item">
              <label htmlFor="game_mode" className="input-label">Game Mode</label>
              <div className="select-wrapper">
                <select
                  id="game_mode"
                  value={gameMode}
                  onChange={(e) => handleGameModeChange(e.target.value as 'singleplayer' | 'multiplayer')}
                  className="setting-input"
                  disabled={agentActive}
                >
                  <option value="singleplayer">Singleplayer</option>
                  <option value="multiplayer">Multiplayer</option>
                </select>
                <ChevronDown className="select-arrow" size={16} strokeWidth={2} />
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
                  placeholder="Enter server address"
                  disabled={agentActive}
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
                placeholder="Enter port number"
                disabled={agentActive}
              />
            </div>

            <div className="setting-item">
              <label htmlFor="minecraft_version" className="input-label">
                Minecraft Version
              </label>
              <div className="select-wrapper">
                <select
                  id="minecraft_version"
                  value={userSettings.minecraft_version}
                  onChange={(e) => {
                    updateField('minecraft_version', e.target.value);
                  }}
                  className="setting-input"
                  disabled={agentActive}
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
                <ChevronDown className="select-arrow" size={16} strokeWidth={2} />
              </div>
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
                    disabled={agentActive}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Voice Input" isExpanded={false}>
            <div className="setting-item">
              <label htmlFor="language" className="input-label">Language/Accent</label>
              <div className="select-wrapper">
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
                <ChevronDown className="select-arrow" size={16} strokeWidth={2} />
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="input-device" className="input-label">Input Device</label>
              <div className="select-wrapper">
                <select
                  id="input-device"
                  value={selectedDevice?.deviceId}
                  onChange={handleInputDeviceChange}
                  disabled={agentActive}
                  className="setting-input"
                >
                  {inputDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Device ${device.deviceId}`}
                    </option>
                  ))}
                </select>
                <ChevronDown className="select-arrow" size={16} strokeWidth={2} />
              </div>
            </div>
          </SettingsSection>
        </div>
      )}
    </div>
  );
}

export default Settings; 