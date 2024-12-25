import { useCallback, useEffect, useState } from "react";
import { Mic } from "react-feather";

import useInputDevices from "../../hooks/useInputDevices";
import { useUserSettings } from "../../contexts/UserSettingsContext/UserSettingsContext";
import settings from "../../utils/settings";
import { useAgent } from "../../contexts/AgentContext/AgentContext";

export default function AudioActions() {
  const { inputDevices } = useInputDevices();
  const { userSettings, updateField } = useUserSettings();
  const { agentActive } = useAgent();

  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<MediaDeviceInfo>();

  useEffect(() => {
    if (inputDevices.length && !selectedDevice) {
      setSelectedDevice(inputDevices[0]);
    }
  }, [inputDevices, selectedDevice])

  const handleVoiceModeChange = ({ target: { value } }: React.ChangeEvent<HTMLSelectElement>) => {
    updateField("voice_mode", value);
  };

  const handleKeyBindingChange = ({ target: { value } }: React.ChangeEvent<HTMLInputElement>) => {
    updateField("key_binding", value);
  };

  const handleKeyPress = ({ key }: React.KeyboardEvent<HTMLInputElement>) => {
    updateField("key_binding", key);
  };

  const handleInputDeviceChange = ({ target: { value } }: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDevice(inputDevices.find((device) => device.deviceId === value));
  };

  const getDeviceMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedDevice ? { exact: selectedDevice.deviceId } : undefined }
      });
      return new MediaRecorder(stream);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      throw error;
    }
  }, [selectedDevice]);

  useEffect(() => {
    if (!isMicrophoneActive) return;

    const socket = new WebSocket(settings.API_BASE_WEBSOCKET_URL);
    let mediaRecorder: MediaRecorder;

    socket.addEventListener("open", async () => {
      console.log("WebSocket connection opened");
      try {
        mediaRecorder = await getDeviceMediaRecorder();
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        mediaRecorder.start(1000);
      } catch (error) {
        console.error("Error opening microphone:", error);
      }
    });

    socket.addEventListener("message", (event) => {
      const transcript = event.data.toString('utf8');
      if (transcript === "Voice Disabled") {
        setIsMicrophoneActive(false);
      } else {
        setIsMicrophoneActive(true);
        if (transcript !== "") {
          // setTranscription(transcript);
        }
      }
    });

    socket.addEventListener("close", () => {
      console.log("WebSocket connection closed");
      setIsMicrophoneActive(false); // Set microphone inactive
    });

    return () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }

      socket.close();
    };
  }, [getDeviceMediaRecorder, isMicrophoneActive]);

  return (
    <>
      <div className="voice-settings">
        <Mic
          className={`microphone-icon ${isMicrophoneActive ? "active" : "inactive"
            }`}
          size={20}
        />
        <label htmlFor="voice-mode">Voice Mode:</label>
        <select
          id="voice-mode"
          value={userSettings.voice_mode}
          onChange={handleVoiceModeChange}
          disabled={agentActive} // Disable when agentStarted is true
        >
          <option value="always_on">Always On</option>
          <option value="push_to_talk">Push to Talk</option>
          <option value="toggle_to_talk">Toggle to Talk</option>
          <option value="off">Off</option>
        </select>
        {(userSettings.voice_mode === "push_to_talk" || userSettings.voice_mode === "toggle_to_talk") && (
          <input
            type="text"
            placeholder="Press a key"
            value={userSettings.key_binding}
            onChange={handleKeyBindingChange}
            onKeyDown={handleKeyPress}
            readOnly
            disabled={agentActive} // Disable when agentStarted is true
            className="key-input"
          />
        )}
      </div>
      <div className="input-device-settings">
        <label htmlFor="input-device">Input Device: </label>
        <select
          id="input-device"
          value={selectedDevice?.deviceId}
          onChange={handleInputDeviceChange}
          disabled={agentActive} // Disable when agentStarted is true
        >
          {inputDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Device ${device.deviceId}`}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
