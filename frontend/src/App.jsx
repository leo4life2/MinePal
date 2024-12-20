import { useState, useEffect } from 'react';
import axios from 'axios';
import mixpanel from 'mixpanel-browser';
import { createClient } from "@supabase/supabase-js";
import './App.css';
import Settings from './components/Settings';
import Actions from './components/Actions';
import Transcription from './components/Transcription';
import Announcement from './components/Announcement';

mixpanel.init('a9bdd5c85dab5761be032f1c1650defa');

const supabaseUrl = "https://wwcgmpbfypiagjfeixmn.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Y2dtcGJmeXBpYWdqZmVpeG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMwNTMwNjAsImV4cCI6MjA0ODYyOTA2MH0.7L7IeDKmuSmI7qKLXgylmwihpM6sLsljv32FsK-sbf4";
const supabase = createClient(supabaseUrl, supabaseKey);

const api = axios.create({
  baseURL: LOCAL_BE_HOST
});

function App() {
  const [settings, setSettings] = useState({
    minecraft_version: "",
    host: "",
    port: "",
    player_username: "",
    profiles: [],
    whisper_to_player: false,
    voice_mode: 'always_on',
    key_binding: '',
    language: 'en',
    openai_api_key: '',
    model: '',
    useOwnApiKey: false
  });

  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [microphone, setMicrophone] = useState(null);
  const [transcription, setTranscription] = useState("");
  const [agentStarted, setAgentStarted] = useState(false);
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState(null);
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [inputDevices, setInputDevices] = useState([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState('');

  const handleProfileSelect = (profile) => {
    setSelectedProfiles(prev => 
      prev.includes(profile) ? prev.filter(p => p !== profile) : [...prev, profile]
    );
    console.log("selected", selectedProfiles);
  };

  const handleSettingChange = (key, value) => {
    setSettings(prevSettings => ({ ...prevSettings, [key]: value }));
  };

  const settingNotes = {
    minecraft_version: "1.14 ~ 1.20.4",
    host: "\"localhost\" for singleplayer. works in some vanilla servers too",
    port: "default is 25565",
    player_username: "your Minecraft username",
    pal_message: "for multiple bots, /msg each bot."
  }

  const fetchSettings = async () => {
    try {
      const response = await api.get('/settings');
      const expectedFields = Object.keys(settings);
      const filteredSettings = Object.fromEntries(
        Object.entries(response.data).filter(([key]) => expectedFields.includes(key))
      );

      // Filter profiles to only include name and personality fields
      if (filteredSettings.profiles) {
        filteredSettings.profiles = filteredSettings.profiles.map(profile => ({
          name: profile.name,
          personality: profile.personality
        }));
      }

      setSettings(prevSettings => ({ ...prevSettings, ...filteredSettings }));
    } catch (err) {
      console.error("Failed to fetch settings:", err);
      setError("Failed to load settings. " + (err.message || "Unknown error"));
      throw err;
    }
  };

  const fetchAgentStatus = async () => {
    try {
      const response = await api.get('/agent-status');
      setAgentStarted(response.data.agentStarted);
    } catch (err) {
      console.error("Failed to fetch agent status:", err);
      setError("Failed to load agent status. " + (err.message || "Unknown error"));
      throw err;
    }
  };

  const fetchBackendAlive = async () => {
    try {
      const response = await api.get('/backend-alive');
      if (!response.data.backend_alive) {
        throw new Error("Backend is down.");
      }
    } catch (err) {
      console.error("Failed to check backend status:", err);
      setError("Failed to check backend status: " + (err.message || "Unknown error"));
      throw err;
    }
  };

  const checkServerAlive = async (host, port) => {
    try {
      const response = await api.get('/check-server', { params: { host, port } });
      return response.data.alive;
    } catch (error) {
      console.error("Server ping failed:", error);
      return false;
    }
  };

  const toggleAgent = async () => {
    if (agentStarted) {
      try {
        const response = await api.post('/stop', {});
        console.log("Agent stopped successfully:", response.data);
        setAgentStarted(false);
        setError(null);
        await stopMicrophone();

        if (startTime) {
          const playTime = (Date.now() - startTime) / 1000;
          mixpanel.track('Bot play time', {
            distinct_id: settings.player_username,
            play_time: playTime
          });
          setStartTime(null);
        }
      } catch (error) {
        console.error("Failed to stop agent:", error);
        setError("Failed to stop agent: " + (error.response?.data || error.message || "Unknown error"));
      }
    } else {
      const emptyFields = Object.entries(settings)
        .filter(([key, value]) => {
          if (!settings.useOwnApiKey && (key === 'openai_api_key' || key === 'model')) {
            return false;
          }
          
          if (key === 'profiles') return value.length === 0;
          if (key === 'key_binding' && (settings.voice_mode === 'always_on' || settings.voice_mode === 'off')) return false;
          if (typeof value === 'string') return value.trim() === '';
          if (Array.isArray(value)) return value.length === 0;
          return value === null || value === undefined;
        })
        .map(([key]) => key);

      if (emptyFields.length > 0) {
        setError(`Please fill in the following fields: ${emptyFields.join(', ')}`);
        return;
      }

      if (!isValidMinecraftUsername(settings.player_username)) {
        setError("Invalid Minecraft username. It should be 3-16 characters long and can only contain letters, numbers, and underscores.");
        return;
    }

      const invalidProfileNames = selectedProfiles.filter(profile => !isValidMinecraftUsername(profile.name));
      if (invalidProfileNames.length > 0) {
          setError(`Invalid profile names: ${invalidProfileNames.map(profile => profile.name).join(', ')}. They should be 3-16 characters long and can only contain letters, numbers, and underscores.`);
          return;
      }

      if (selectedProfiles.length === 0) {
        setError("Please select at least one pal to play with.");
        return;
      }

      const serverAlive = await checkServerAlive(settings.host, settings.port);
      if (!serverAlive) {
        setError("The Minecraft server is not reachable. Please check the host and port.");
        return;
      }
      try {
        const filteredSettings = {
          ...settings,
          profiles: selectedProfiles, // Only send selected profiles
          useOwnApiKey: settings.useOwnApiKey 
        };
        const response = await api.post('/start', filteredSettings);
        console.log("Agent started successfully:", response.data);
        setAgentStarted(true);
        setError(null); // Clear errors on success

        // Identify the user in Mixpanel
        mixpanel.identify(settings.player_username);

        // Track the number of bots spawned
        mixpanel.track('Bots spawned', {
          distinct_id: settings.player_username,
          bot_count: selectedProfiles.length
        });

        // Set the start time for tracking
        setStartTime(Date.now());

        // Automatically handle microphone based on voice mode
        // temporarily disabling voice mode due to influx
        // if (settings.voice_mode !== 'off') {
        //   startMicrophone();
        // }

      } catch (error) {
        console.error("Failed to start agent:", error);
        setError(error.message || "An unknown error occurred while starting the agent.");
      }
    }
  };

  const isValidMinecraftUsername = (username) => {
    const regex = /^[a-zA-Z0-9_]{3,16}$/;
    return regex.test(username);
  };

  const getMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined }
      });
      return new MediaRecorder(stream);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      throw error;
    }
  };

  const openMicrophone = async (mic, sock) => {
    return new Promise((resolve) => {
      mic.onstart = () => {
        console.log("Microphone started");
        resolve();
      };

      mic.onstop = () => {
        console.log("Microphone stopped");
      };

      mic.ondataavailable = (event) => {
        if (event.data.size > 0 && sock.readyState === WebSocket.OPEN) {
          sock.send(event.data);
        }
      };

      mic.start(1000);
    });
  };

  const closeMicrophone = async (mic) => {
    if (mic && mic.state !== "inactive") {
      mic.stop();
    }
  };

  const startMicrophone = async () => {
    const wsUrl = api.defaults.baseURL.replace(/^http/, 'ws');
    const newSocket = new WebSocket(`${wsUrl}`);
    setSocket(newSocket);

    newSocket.addEventListener("open", async () => {
      console.log("WebSocket connection opened");
      try {
        const mic = await getMicrophone();
        setMicrophone(mic);
        await openMicrophone(mic, newSocket);
        setIsMicrophoneActive(true); // Set microphone active
      } catch (error) {
        console.error("Error opening microphone:", error);
        setError("Failed to start recording. Please check your microphone permissions.");
      }
    });

    newSocket.addEventListener("message", (event) => {
      const transcript = event.data.toString('utf8');
      if (transcript === "Voice Disabled") {
        setIsMicrophoneActive(false);
      } else {
        setIsMicrophoneActive(true);
        if (transcript !== "") {
          setTranscription(transcript);
        }
      }
    });

    newSocket.addEventListener("close", () => {
      console.log("WebSocket connection closed");
      setIsMicrophoneActive(false); // Set microphone inactive
    });
  };

  const stopMicrophone = async () => {
    if (microphone) {
      await closeMicrophone(microphone);
      setMicrophone(null);
    }
    if (socket) {
      socket.close();
      setSocket(null);
    }
    setIsMicrophoneActive(false); // Set microphone inactive
  };

  const handleBeforeUnload = (event) => {
    // This might not work lol, because we're an Electron app, but just gonna have this here first.
    
    if (agentStarted) {
      const playTime = (Date.now() - startTime) / 1000; // in seconds
      mixpanel.track('Bot play time', {
        distinct_id: settings.player_username,
        play_time: playTime
      });
    }
  };

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [agentStarted, startTime]);

  useEffect(() => {
    const fetchDataWithRetry = async () => {
      const startTime = Date.now();
      const timeoutDuration = 5000;

      while (Date.now() - startTime < timeoutDuration) {
        try {
          await fetchSettings();
          await fetchAgentStatus();
          await fetchBackendAlive();
          setError(null);
          break; // Exit loop if all fetches succeed
        } catch (err) {
          console.error("Fetch failed, retrying...", err);
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait before retrying
        }
      }

      setLoading(false);
    };

    fetchDataWithRetry();
  }, []);

  useEffect(() => {
    if (!agentStarted) {
      stopMicrophone();
    }
  }, [agentStarted]);

  useEffect(() => {
    const getInputDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
        setInputDevices(audioInputDevices);
        if (audioInputDevices.length > 0) {
          setSelectedInputDevice(audioInputDevices[0].deviceId);
        }
      } catch (error) {
        console.error("Error fetching input devices:", error);
      }
    };

    getInputDevices();
  }, []);

  if (loading) {
    return <div className="spinner">Loading...</div>;
  }

  return (
    <div className="container">
      <h1>MinePal Control Panel</h1>
      <Announcement />
      <Settings
        settings={settings}
        setSettings={setSettings}
        settingNotes={settingNotes}
        selectedProfiles={selectedProfiles}
        handleProfileSelect={handleProfileSelect}
        handleSettingChange={handleSettingChange}
        api={api}
      />
      <Actions
        agentStarted={agentStarted}
        toggleAgent={toggleAgent}
        stopMicrophone={stopMicrophone}
        isMicrophoneActive={isMicrophoneActive}
        settings={settings}
        setSettings={setSettings}
        inputDevices={inputDevices}
        selectedInputDevice={selectedInputDevice}
        setSelectedInputDevice={setSelectedInputDevice}
        supabase={supabase}
      />
      {error && <div className="error-message">{error}</div>}
      <div className="guides-text">
        questions? see guides at <a href="https://minepal.net/guides" target="_blank" rel="noopener noreferrer" className="guides-link">guides / faq</a>
      </div>
      {/* <Transcription transcription={transcription} /> */}
    </div>
  );
}

export default App;