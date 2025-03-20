import { useEffect, useState, useRef } from "react";
import { Mic } from "react-feather";

import useInputDevices from "../../hooks/useInputDevices";
import { useUserSettings } from "../../contexts/UserSettingsContext/UserSettingsContext";
import { useAgent } from "../../contexts/AgentContext/AgentContext";
import Transcription from "../Transcription";

export default function AudioActions() {
  const { inputDevices } = useInputDevices();
  const { userSettings, updateField } = useUserSettings();
  const { agentActive } = useAgent();

  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<MediaDeviceInfo>();
  const [transcription, setTranscription] = useState("");
  
  // Refs for recording functionality
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (inputDevices.length && !selectedDevice) {
      setSelectedDevice(inputDevices[0]);
    }
  }, [inputDevices, selectedDevice]);

  // Add event listeners for the "V" key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log(`[DEBUG] Key down: ${e.key}`);
      if (e.key.toLowerCase() === "v" && !isMicrophoneActive) {
        console.log('[DEBUG] "V" key pressed, starting recording');
        startRecording();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      console.log(`[DEBUG] Key up: ${e.key}`);
      if (e.key.toLowerCase() === "v" && isMicrophoneActive) {
        console.log('[DEBUG] "V" key released, stopping recording');
        stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      
      // Clean up any active streams when component unmounts
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isMicrophoneActive]);

  const startRecording = async () => {
    try {
      console.log('[DEBUG] Starting recording process');
      console.log('[DEBUG] Requesting microphone access');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDevice ? { exact: selectedDevice.deviceId } : undefined,
          channelCount: 1,
          sampleRate: 16000
        }
      });
      
      console.log('[DEBUG] Microphone access granted');
      console.log('[DEBUG] Selected device:', selectedDevice?.label || 'Default device');
      streamRef.current = stream;
      
      // Create MediaRecorder with opus mime type
      console.log('[DEBUG] Creating MediaRecorder with opus codec');
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`[DEBUG] Data available event, size: ${event.data.size} bytes`);
          audioChunksRef.current.push(event.data);
        }
      };
      
      console.log('[DEBUG] Starting MediaRecorder');
      mediaRecorder.start();
      setIsMicrophoneActive(true);
      console.log('[DEBUG] Microphone activated');
    } catch (error) {
      console.error("[DEBUG] Error starting recording:", error);
    }
  };

  const stopRecording = async () => {
    console.log('[DEBUG] Stopping recording');
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      console.log(`[DEBUG] MediaRecorder state before stopping: ${mediaRecorderRef.current.state}`);
      
      // Set the onstop handler BEFORE calling stop()
      mediaRecorderRef.current.onstop = async () => {
        console.log('[DEBUG] MediaRecorder onstop event fired');
        console.log(`[DEBUG] Audio chunks collected: ${audioChunksRef.current.length}`);
        
        // Create audio blob from chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        console.log(`[DEBUG] Audio blob created, size: ${audioBlob.size} bytes`);
        
        // Send to Deepgram
        console.log('[DEBUG] Sending audio to Deepgram');
        await sendToDeepgram(audioBlob);
        
        // Clean up
        console.log('[DEBUG] Cleaning up resources');
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            console.log(`[DEBUG] Stopping track: ${track.kind}`);
            track.stop();
          });
          streamRef.current = null;
          console.log('[DEBUG] Stream tracks stopped and reference cleared');
        }
        
        setIsMicrophoneActive(false);
        console.log('[DEBUG] Microphone deactivated');
      };
      
      // Now call stop() after setting the handler
      mediaRecorderRef.current.stop();
      console.log('[DEBUG] MediaRecorder stop called');
    } else {
      console.log('[DEBUG] MediaRecorder not active or not initialized');
    }
  };

  const sendToDeepgram = async (audioBlob: Blob) => {
    try {
      console.log('[DEBUG] Preparing to send to Deepgram API');
      // Replace with your actual API key
      const apiKey = "3bc65aa2474c34fbe5a7c297c07e9a6cd9a48011";
      
      console.log('[DEBUG] Sending fetch request to Deepgram');
      const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'audio/webm;codecs=opus'
        },
        body: audioBlob
      });
      
      console.log(`[DEBUG] Deepgram response status: ${response.status}`);
      const data = await response.json();
      console.log('[DEBUG] Deepgram response data:', data);
      
      if (data && data.results && data.results.channels && data.results.channels.length > 0) {
        const transcriptText = data.results.channels[0].alternatives[0].transcript;
        console.log(`[DEBUG] Transcription received: "${transcriptText}"`);
        setTranscription(transcriptText);
        console.log('[DEBUG] Transcription state updated');
      } else {
        console.log('[DEBUG] No valid transcription in response data');
      }
    } catch (error) {
      console.error("[DEBUG] Error sending audio to Deepgram:", error);
    }
  };

  // Original handlers
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

  return (
    <>
      <div className="voice-settings">
        <Mic
          className={`microphone-icon ${isMicrophoneActive ? "active" : "inactive"}`}
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
      
      {/* Display transcription component */}
      <Transcription transcription={transcription} />
    </>
  );
}
