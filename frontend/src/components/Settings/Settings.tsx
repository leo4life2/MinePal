import { useState, useEffect, ReactNode, useRef } from 'react';
import { Settings as SettingsIcon, ChevronDown, X } from 'react-feather';
import { useUserSettings } from '../../contexts/UserSettingsContext/UserSettingsContext';
import supportedLocales from '../../utils/supportedLocales';
import { useAgent } from '../../contexts/AgentContext/AgentContext';
import useInputDevices from '../../hooks/useInputDevices';
import { BrowserKeyCodeMap, KeyDisplayMap } from '../../utils/keyCodes';
import { validateUserSettings } from '../../utils/validation';
import './Settings.css';

interface SettingsSectionProps {
  title: string;
  isExpanded?: boolean;
  children: ReactNode;
}

// Settings section component
function SettingsSection({ title, isExpanded: defaultExpanded = false, children }: SettingsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  // Update internal state when prop changes
  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);
  
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
  const [isExpanded, setIsExpanded] = useState(() => {
    // Auto-expand if there are empty required fields
    const emptyFields = validateUserSettings(userSettings);
    return emptyFields.length > 0;
  });
  const [gameMode, setGameMode] = useState('singleplayer');
  const [selectedDevice, setSelectedDevice] = useState<MediaDeviceInfo>();
  const [listeningForKey, setListeningForKey] = useState(false);
  const [keyDisplayName, setKeyDisplayName] = useState('');
  const [voiceInputExpanded, setVoiceInputExpanded] = useState(() => {
    // Auto-expand voice input section if key_binding is empty
    return !userSettings.key_binding;
  });
  const deviceInitialized = useRef(false);
  
  // Auto-expand settings if there are empty required fields (only check on initial load)
  useEffect(() => {
    const emptyFields = validateUserSettings(userSettings);
    if (emptyFields.length > 0 && !isExpanded) {
      setIsExpanded(true);
    }
    // Auto-collapse if no problems detected
    if (emptyFields.length === 0 && isExpanded) {
      setIsExpanded(false);
    }
    
    // Auto-expand voice input section if key_binding is empty
    if (!userSettings.key_binding && !voiceInputExpanded) {
      setVoiceInputExpanded(true);
    }
    // Auto-collapse voice input section if key_binding is set
    if (userSettings.key_binding && voiceInputExpanded) {
      setVoiceInputExpanded(false);
    }
  }, []);
  
  // Safely access host using a defensive approach
  useEffect(() => {
    const currentHost = userSettings.host || '';
    setGameMode(currentHost === 'localhost' ? 'singleplayer' : 'multiplayer');
  }, [userSettings.host]);

  // Initialize selected device when inputDevices are loaded
  useEffect(() => {
    if (inputDevices.length && !deviceInitialized.current) {
      // Try to find device matching the stored device ID
      const storedDeviceId = userSettings.input_device_id;
      
      // Only try to match if we have a stored device ID
      if (storedDeviceId) {
        const matchingDevice = inputDevices.find(device => device.deviceId === storedDeviceId);

        if (matchingDevice) {
          setSelectedDevice(matchingDevice);
          deviceInitialized.current = true;
          return;
        }
      }
      
      // Fallback to first device if no match found or no stored ID
      setSelectedDevice(inputDevices[0]);
      
      // Only update settings if no device ID is stored
      if (!storedDeviceId) {
        updateField('input_device_id', inputDevices[0].deviceId);
      }
      
      deviceInitialized.current = true;
    }
  }, [inputDevices, userSettings.input_device_id, updateField]);

  // Initialize key display name
  useEffect(() => {
    if (userSettings.key_binding) {
      setKeyDisplayName(getKeyName(userSettings.key_binding));
    }
  }, [userSettings.key_binding]);

  // Get readable key name from key code
  const getKeyName = (keyCode: string) => {
    return KeyDisplayMap[keyCode] || `Key ${keyCode}`;
  };

  // Start listening for key input
  const startKeyBinding = () => {
    setListeningForKey(true);
    
    // Add one-time event listener for keydown
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      
      // Get key code from our mapping
      const keyCode = (BrowserKeyCodeMap[e.code] ?? -1).toString();
      
      updateField('key_binding', keyCode);
      setKeyDisplayName(getKeyName(keyCode));
      setListeningForKey(false);
      
      // Remove the event listener
      window.removeEventListener('keydown', handleKeyDown);
    };
    
    window.addEventListener('keydown', handleKeyDown);
  };

  // Clear key binding
  const clearKeyBinding = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateField('key_binding', '');
    setKeyDisplayName('');
  };

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
    console.log('selected deviceId', deviceId);
    const device = inputDevices.find(d => d.deviceId === deviceId);
    if (device) {
      setSelectedDevice(device);
      // Save the device ID directly
      updateField('input_device_id', device.deviceId);
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
                Your Username
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

          <SettingsSection title="Voice Input" isExpanded={voiceInputExpanded}>
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
              <label htmlFor="key_binding" className="input-label">Push-to-Talk Key</label>
              <div 
                className={`key-binding-input ${listeningForKey ? 'listening' : ''}`}
                onClick={() => !agentActive && startKeyBinding()}
              >
                {listeningForKey ? (
                  <span className="key-listening-text">Press any key...</span>
                ) : keyDisplayName ? (
                  <div className="key-display">
                    <span>{keyDisplayName}</span>
                    <X 
                      className="key-clear-icon" 
                      size={16} 
                      onClick={clearKeyBinding} 
                    />
                  </div>
                ) : (
                  <span className="key-binding-placeholder">Click to set key</span>
                )}
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