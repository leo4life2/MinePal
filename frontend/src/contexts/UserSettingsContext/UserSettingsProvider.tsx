import { useState, useEffect, useCallback } from 'react';
import { fetchSettings } from '../../utils/api';
import useWebRequest from '../../hooks/useWebRequest';
import { UserSettings } from '../../types/apiTypes';
import defaultUserSettings from '../../utils/defaultUserSettings';
import { UserSettingsContext } from './UserSettingsContext';

export default function UserSettingsProvider({ children }: React.PropsWithChildren) {
  const { data, refetch } = useWebRequest("settings", fetchSettings);
  const [userSettings, setSettings] = useState<UserSettings>({ ...defaultUserSettings });

  const updateField = useCallback((key: keyof UserSettings, value: unknown) => {
    setSettings(prevSettings => ({ ...prevSettings, [key]: value }));
  }, []);

  useEffect(() => {
    if (data) {
      setSettings(data);
    }
  }, [data]);

  return (
    <UserSettingsContext.Provider value={{ userSettings, updateField, refresh: refetch }}>
      {children}
    </UserSettingsContext.Provider>
  );
}
