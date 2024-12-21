import { useCallback, useEffect, useState } from "react";

import { isValidMinecraftUsername, validateUserSettings } from "../../utils/validation";
import { useUserSettings } from "../UserSettingsContext/UserSettingsContext";
import { checkServerAlive, startAgent, stopAgent } from "../../utils/api";
import { Profile } from "../../types/apiTypes";
import { startTrackingSession, stopTrackingSession } from "../../utils/tracking";
import { useErrorReport } from "../ErrorReportContext/ErrorReportContext";
import { AgentContext } from "./AgentContext";

export default function AgentProvider({ children }: React.PropsWithChildren) {
  const { userSettings } = useUserSettings();
  const { declareError, clearError } = useErrorReport();
  const [active, setActive] = useState<boolean>(false);
  const [selectedProfiles, setSelectedProfiles] = useState<Profile[]>([]);

  const start = useCallback(async () => {
    const emptyFields = validateUserSettings(userSettings);

    if (emptyFields.length > 0) {
      declareError("AgentProvider", `Please fill in the following fields: ${emptyFields.join(', ')}`, true);
      return;
    }

    if (!isValidMinecraftUsername(userSettings.player_username)) {
      declareError("AgentProvider", "Invalid Minecraft username. It should be 3-16 characters long and can only contain letters, numbers, and underscores.", true);
      return;
    }

    const invalidProfileNames = selectedProfiles.filter(profile => !isValidMinecraftUsername(profile.name));
    if (invalidProfileNames.length > 0) {
      declareError("AgentProvider", `Invalid profile names: ${invalidProfileNames.map(profile => profile.name).join(', ')}. They should be 3-16 characters long and can only contain letters, numbers, and underscores.`, true);
      return;
    }

    if (selectedProfiles.length === 0) {
      declareError("AgentProvider", "Please select at least one pal to play with.", true);
      return;
    }

    const serverAlive = await checkServerAlive(userSettings.host, userSettings.port);
    if (!serverAlive) {
      declareError("AgentProvider", "The Minecraft server is not reachable. Please check the host and port.", true);
      return;
    }
    try {
      const status = await startAgent({
        ...userSettings,
        profiles: selectedProfiles,
      });
      console.log("Agent started successfully:", status);
      setActive(true);
      clearError()

      startTrackingSession(userSettings.player_username, selectedProfiles.length);
    } catch (error) {
      if (error instanceof Error) {
        declareError("AgentProvider", error);
      } else {
        declareError("AgentProvider", "An unknown error occurred while stopping the agent.");
      }
    }
  }, [userSettings, selectedProfiles, declareError, clearError]);

  const stop = useCallback(async () => {
    try {
      const success = await stopAgent();
      console.log("Agent stopped successfully:", success);
      setActive(false);
      clearError();
      stopTrackingSession(userSettings.player_username);
    } catch (error) {
      if (error instanceof Error) {
        declareError("AgentProvider", error);
      } else {
        declareError("AgentProvider", "An unknown error occurred while stopping the agent.");
      }
    }
  }, [declareError, clearError, userSettings])

  const toggleProfile = useCallback((profile: Profile) => {
    setSelectedProfiles((currentProfiles) => currentProfiles.includes(profile)
      ? currentProfiles.filter((currentProfile) => currentProfile !== profile)
      : [...currentProfiles, profile]);
  }, []);

  useEffect(() => {
    if (active) {
      const handleBeforeUnload = () => {
        // This might not work lol, because we're an Electron app, but just gonna have this here first.
        stopTrackingSession(userSettings.player_username);
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [active, userSettings.player_username]);

  return (
    <AgentContext.Provider
      value={{
        agentActive: active,
        start,
        stop,
        selectedProfiles,
        toggleProfile,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}
