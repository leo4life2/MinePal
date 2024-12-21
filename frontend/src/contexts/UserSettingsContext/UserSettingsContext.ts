import { createContext, useContext } from "react";
import { UserSettings } from "../../types/apiTypes";
import defaultUserSettings from "../../utils/defaultUserSettings";

type UserSettingsContextType = {
  userSettings: UserSettings;
  updateField: (key: keyof UserSettings, value: unknown) => void;
}

const DEFAULT_USER_SETTINGS_CONTEXT: UserSettingsContextType = {
  userSettings: { ...defaultUserSettings },
  updateField: () => { },
};

export const UserSettingsContext = createContext(DEFAULT_USER_SETTINGS_CONTEXT);

export function useUserSettings() {
  return useContext(UserSettingsContext);
}
