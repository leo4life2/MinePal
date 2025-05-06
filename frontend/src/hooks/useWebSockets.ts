import { useEffect, useRef, useCallback } from 'react';
import { useErrorReport } from '../contexts/ErrorReportContext/ErrorReportContext';
import { useUserSettings } from '../contexts/UserSettingsContext/UserSettingsContext';
import { useAgent } from '../contexts/AgentContext/AgentContext';
import settings from '../utils/settings';

export default function useWebSockets() {
  const wsRef = useRef<WebSocket | null>(null);
  const { declareError } = useErrorReport();
  const { userSettings } = useUserSettings();
  const { stop } = useAgent();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);

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
      declareError('useWebSockets', error as Error);
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
        declareError('useWebSockets', new Error('Audio data too small'));
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result as string;
        if (!base64Audio || base64Audio === 'data:audio/ogg; codecs=opus;base64,') {
          console.error('Invalid base64 audio data');
          declareError('useWebSockets', new Error('Invalid audio data'));
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
          
          if (data.type === 'keydown') {
            handleStartRecording().catch((err) => declareError('useWebSockets', err));
          } else if (data.type === 'keyup') {
            handleStopRecording();
          } else if (data.type === 'play-audio-frontend') {
            if (data.audioData && typeof data.audioData === 'string') {
              console.log('Received audio data for playback from server.');
              try {
                const audioSrc = `data:audio/wav;base64,${data.audioData}`;
                const audio = new Audio(audioSrc);
                audio.play().catch(e => {
                  console.error('Error playing audio:', e);
                  declareError('useWebSockets', new Error(`Frontend audio playback failed: ${e.message}`));
                });
              } catch (e: unknown) {
                console.error('Error constructing audio for playback:', e);
                if (e instanceof Error) {
                  declareError('useWebSockets', new Error(`Frontend audio construction failed: ${e.message}`));
                } else {
                  declareError('useWebSockets', new Error(`Frontend audio construction failed: Unknown error`));
                }
              }
            } else {
              console.warn('Received play-audio-frontend message without valid audioData.');
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

            declareError('useWebSockets', new Error(errorMessage), true);
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          declareError('useWebSockets', error instanceof Error ? error : new Error(String(error)));
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        declareError('useWebSockets', error instanceof Error ? error : new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        console.log('WebSocket closed for push-to-talk');
        wsRef.current = null;
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      declareError('useWebSockets', error instanceof Error ? error : new Error(String(error)));
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