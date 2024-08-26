import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMicrophone,
  faMicrophoneSlash,
} from "@fortawesome/free-solid-svg-icons";
import "./Actions.css";

function Actions({
  agentStarted,
  toggleAgent,
  stopMicrophone,
  settings,
  setSettings,
  isMicrophoneActive,
  inputDevices, // Add inputDevices prop
  selectedInputDevice, // Add selectedInputDevice prop
  setSelectedInputDevice // Add setSelectedInputDevice prop
}) {
  const handleVoiceModeChange = (event) => {
    setSettings(prevSettings => ({ ...prevSettings, voice_mode: event.target.value }));
  };

  const handleKeyBindingChange = (event) => {
    setSettings(prevSettings => ({ ...prevSettings, key_binding: event.target.value }));
  };

  const handleKeyPress = (event) => {
    setSettings(prevSettings => ({ ...prevSettings, key_binding: event.key }));
  };

  const handleLanguageChange = (event) => {
    setSettings(prevSettings => ({ ...prevSettings, language: event.target.value }));
  };

  const handleInputDeviceChange = (event) => {
    setSelectedInputDevice(event.target.value);
  };

  useEffect(() => {
    if (!agentStarted) {
      stopMicrophone();
    }
  }, [agentStarted]);

  return (
    <div className="actions">
      <div className="voice-settings">
        <FontAwesomeIcon
          icon={isMicrophoneActive ? faMicrophone : faMicrophoneSlash}
          className={`microphone-icon ${
            isMicrophoneActive ? "active" : "inactive"
          }`}
        />
        <span htmlFor="voice-mode">Voice Mode:</span>
        <select
          id="voice-mode"
          value={settings.voice_mode}
          onChange={handleVoiceModeChange}
          disabled={agentStarted} // Disable when agentStarted is true
        >
          <option value="always_on">Always On</option>
          <option value="push_to_talk">Push to Talk</option>
          <option value="toggle_to_talk">Toggle to Talk</option>
          <option value="off">Off</option>
        </select>
        {(settings.voice_mode === "push_to_talk" || settings.voice_mode === "toggle_to_talk") && (
          <input
            type="text"
            placeholder="Press a key"
            value={settings.key_binding}
            onChange={handleKeyBindingChange}
            onKeyDown={handleKeyPress}
            readOnly
            disabled={agentStarted} // Disable when agentStarted is true
            className="key-input"
          />
        )}
      </div>
      <div className="input-device-settings">
        <span htmlFor="input-device">Input Device: </span>
        <select
          id="input-device"
          value={selectedInputDevice}
          onChange={handleInputDeviceChange}
          disabled={agentStarted} // Disable when agentStarted is true
        >
          {inputDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Device ${device.deviceId}`}
            </option>
          ))}
        </select>
      </div>
      <div className="language-settings">
        <span htmlFor="language">Language/Accent:</span>
        <select
          id="language"
          value={settings.language}
          onChange={handleLanguageChange}
          disabled={agentStarted} // Disable when agentStarted is true
        >
          <option value="bg">Bulgarian</option>
          <option value="ca">Catalan</option>
          <option value="zh">Chinese (Mandarin)</option>
          <option value="zh-CN">Chinese (Mandarin, China)</option>
          <option value="zh-TW">Chinese (Mandarin, Taiwan)</option>
          <option value="cs">Czech</option>
          <option value="da">Danish</option>
          <option value="da-DK">Danish (Denmark)</option>
          <option value="nl">Dutch</option>
          <option value="en">English</option>
          <option value="en-US">English (US)</option>
          <option value="en-AU">English (Australia)</option>
          <option value="en-GB">English (UK)</option>
          <option value="en-NZ">English (New Zealand)</option>
          <option value="en-IN">English (India)</option>
          <option value="et">Estonian</option>
          <option value="fi">Finnish</option>
          <option value="nl-BE">Flemish (Belgium)</option>
          <option value="fr">French</option>
          <option value="fr-CA">French (Canada)</option>
          <option value="de">German</option>
          <option value="de-CH">German (Switzerland)</option>
          <option value="el">Greek</option>
          <option value="hi">Hindi</option>
          <option value="hu">Hungarian</option>
          <option value="id">Indonesian</option>
          <option value="it">Italian</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="ko-KR">Korean (South Korea)</option>
          <option value="lv">Latvian</option>
          <option value="lt">Lithuanian</option>
          <option value="ms">Malay</option>
          <option value="multi">Multilingual (Spanish + English)</option>
          <option value="no">Norwegian</option>
          <option value="pl">Polish</option>
          <option value="pt">Portuguese</option>
          <option value="pt-BR">Portuguese (Brazil)</option>
          <option value="ro">Romanian</option>
          <option value="ru">Russian</option>
          <option value="sk">Slovak</option>
          <option value="es">Spanish</option>
          <option value="es-419">Spanish (Latin America)</option>
          <option value="sv">Swedish</option>
          <option value="sv-SE">Swedish (Sweden)</option>
          <option value="th">Thai</option>
          <option value="th-TH">Thai (Thailand)</option>
          <option value="tr">Turkish</option>
          <option value="uk">Ukrainian</option>
          <option value="vi">Vietnamese</option>
        </select>
      </div>
      <button className="action-button" onClick={toggleAgent}>
        {agentStarted ? "Stop Bot" : "Start Bot"}
      </button>
    </div>
  );
}

export default Actions;