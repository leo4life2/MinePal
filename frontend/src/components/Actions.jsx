import React from 'react';

function Actions({ agentStarted, toggleAgent, isRecording, toggleMic }) {
  return (
    <div className="actions">
      <button className="action-button" onClick={toggleAgent}>
        {agentStarted ? 'Stop Agent' : 'Start Agent'}
      </button>
      <button className="action-button" onClick={toggleMic}>
        {isRecording ? 'Voice Off' : 'Voice On'}
      </button>
    </div>
  );
}

export default Actions;