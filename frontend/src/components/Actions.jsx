import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faMicrophoneSlash } from '@fortawesome/free-solid-svg-icons';
import './Actions.css'

function Actions({ agentStarted, toggleAgent, stopMicrophone, voiceMode, setVoiceMode, isMicrophoneActive }) {
  const handleVoiceModeChange = (event) => {
    setVoiceMode(event.target.value);
  };

  useEffect(() => {
    if (!agentStarted) {
      stopMicrophone();
    }
  }, [agentStarted]);

  return (
    <div className="actions">
      <button className="action-button" onClick={toggleAgent}>
        {agentStarted ? 'Stop Agent' : 'Start Agent'}
      </button>
      <div className="voice-settings">
        <FontAwesomeIcon 
          icon={isMicrophoneActive ? faMicrophone : faMicrophoneSlash} 
          className={`microphone-icon ${isMicrophoneActive ? 'active' : 'inactive'}`} 
        />
        <span htmlFor="voice-mode">Voice Mode:</span>
        <select id="voice-mode" value={voiceMode} onChange={handleVoiceModeChange}>
          <option value="always_on">Always On</option>
          <option value="off">Off</option>
        </select>
      </div>
    </div>
  );
}

export default Actions;