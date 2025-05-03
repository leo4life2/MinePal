import { useEffect, useRef, useCallback } from 'react';
import { useErrorReport } from '../contexts/ErrorReportContext/ErrorReportContext';
import { useUserSettings } from '../contexts/UserSettingsContext/UserSettingsContext';
import { useAgent } from '../contexts/AgentContext/AgentContext';
import settings from '../utils/settings';

const cleanDeviceLabel = (label: string) => {
  if (!label) return "";
  return label.replace(/\s*\([^)]*\)\s*/g, "").replace(/^Default\s*-\s*/i, "").trim();
};

export default function usePushToTalk() {
  const wsRef = useRef<WebSocket | null>(null);
  const { declareError } = useErrorReport();
  const { userSettings } = useUserSettings();
  const { stop } = useAgent();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const findDeviceIdByLabel = useCallback(async (targetLabel: string) => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter((device) => device.kind === "audioinput");
      const cleanedTargetLabel = cleanDeviceLabel(targetLabel);
      for (const device of audioDevices) {
        const cleanedDeviceLabel = cleanDeviceLabel(device.label);
        if (cleanedDeviceLabel.includes(cleanedTargetLabel)) {
          return device.deviceId;
        }
      }
      return void 0;
    } catch (error) {
      console.error("Error finding device:", error);
      return void 0;
    }
  }, []);

  const handleStartRecording = useCallback(async () => {
    if (isRecordingRef.current) return; // Already recording
    isRecordingRef.current = true;

    try {
      // Only try to get audio stream if input device is configured
      let stream;
      if (userSettings.input_device_id) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: userSettings.input_device_id },
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } else {
        // If no input device configured, don't start recording
        isRecordingRef.current = false;
        return;
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(100);
    } catch (error) {
      console.error('Failed to start recording:', error);
      isRecordingRef.current = false;
      declareError('usePushToTalk', error as Error);
    }
  }, [userSettings.input_device_id, declareError]);

  const handleStopRecording = useCallback(() => {
    if (!isRecordingRef.current || !mediaRecorderRef.current) return;

    const recorder = mediaRecorderRef.current;
    
    // Clone the original onstop callback
    const originalOnStop = recorder.onstop;
    
    recorder.onstop = (e) => {
      // Call the original onstop handler to clean up tracks
      if (originalOnStop) {
        originalOnStop.call(recorder, e);
      }
      
      isRecordingRef.current = false;

      if (audioChunksRef.current.length === 0) {
        console.warn('No audio data collected');
        mediaRecorderRef.current = null;
        return;
      }

      const audioBlob = new Blob(audioChunksRef.current, {
        type: 'audio/ogg; codecs=opus',
      });
      
      if (audioBlob.size < 100) {
        console.error('Audio data appears to be corrupt or too small');
        declareError('usePushToTalk', new Error('Audio data too small'));
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result as string;
        if (!base64Audio || base64Audio === 'data:audio/ogg; codecs=opus;base64,') {
          console.error('Invalid base64 audio data');
          declareError('usePushToTalk', new Error('Invalid audio data'));
          mediaRecorderRef.current = null;
          audioChunksRef.current = [];
          return;
        }

        const audioData = base64Audio.split(',')[1];

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'audio-binary',
              audio: audioData,
            }),
          );
        }

        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
      };

      reader.readAsDataURL(audioBlob);
    };

    recorder.stop();
  }, [declareError]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(`${settings.API_BASE_WEBSOCKET_URL}/push-to-talk`);
      
      ws.onopen = () => {
        console.log('WebSocket connected for push-to-talk');
        // Only send device ID if configured
        if (userSettings.input_device_id) {
          ws.send(JSON.stringify({
            type: 'config',
            deviceId: userSettings.input_device_id
          }));
        }
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "keydown") {
            handleStartRecording().catch((err) =>
              declareError("usePushToTalk", err)
            );
          } else if (data.type === "keyup") {
            handleStopRecording();
          } else if (data.type === "keydown2") {
            if (isRecordingRef.current) {
              handleStopRecording();
            }
            const deviceId = await findDeviceIdByLabel(
              userSettings.input_device_id
            );
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: deviceId ? { exact: deviceId } : void 0,
                echoCancellation: true,
                noiseSuppression: true,
              },
            });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            const javascriptNode = audioContext.createScriptProcessor(
              2048,
              1,
              1
            );

            analyser.smoothingTimeConstant = 0.3;
            analyser.fftSize = 1024;

            microphone.connect(analyser);
            analyser.connect(javascriptNode);
            javascriptNode.connect(audioContext.destination);

            let startedTime = 0;

            javascriptNode.onaudioprocess = function () {
              const array = new Uint8Array(analyser.frequencyBinCount);
              analyser.getByteFrequencyData(array);
              let values = 0;

              const length = array.length;
              for (let i = 0; i < length; i++) {
                values += array[i];
              }

              const average = values / length;
              if (
                average >= 25 &&
                (startedTime === 0 || Date.now() - startedTime < 10000)
              ) {
                if (
                  !isRecordingRef.current &&
                  Date.now() - startedTime > 1000
                ) {
                  startedTime = Date.now();
                  handleStartRecording().catch((err) =>
                    declareError("usePushToTalk", err)
                  );
                }
              } else {
                if (isRecordingRef.current && Date.now() - startedTime > 1000) {
                  handleStopRecording();
                  startedTime = 0;
                }
              }
            };

            mediaRecorder.onstop = () => {
              stream.getTracks().forEach((track) => track.stop());
              javascriptNode.disconnect();
              analyser.disconnect();
            };

            mediaRecorder.start(100);
          } else if (data.type === "keyup2") {
            if (isRecordingRef.current) {
              handleStopRecording();
            }
          } else if (data.type === 'bot-kicked') {
            // Create appropriate error message based on the reason
            let errorMessage = "Bot disconnected";
            if (data.reason === 'version_incompatible') {
              errorMessage = "Unsupported Minecraft version.";
            } else if (data.reason === 'kicked_from_server') {
              errorMessage = "Bot was kicked from the Minecraft server.";
            } else if (data.reason === 'terminated') {
              errorMessage = "Bot process was terminated.";
            } else if (data.reason === 'modded_server') {
              errorMessage = "Server appears to have mods that MinePal doesn't support yet.";
            }
            
            // Call stop function to update UI state
            await stop();

            declareError('usePushToTalk', new Error(errorMessage), true);
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          declareError('usePushToTalk', error instanceof Error ? error : new Error(String(error)));
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        declareError('usePushToTalk', error instanceof Error ? error : new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        console.log('WebSocket closed for push-to-talk');
        wsRef.current = null;
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      declareError('usePushToTalk', error instanceof Error ? error : new Error(String(error)));
    }
  }, [userSettings.input_device_id, declareError, handleStartRecording, handleStopRecording, stop]);

  const disconnect = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    mediaRecorderRef.current = null;
    isRecordingRef.current = false;
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN
  };
} 