import './App.css';
import Settings from './components/Settings';
import Actions from './components/Actions/Actions';
import UserSettingsProvider from './contexts/UserSettingsContext/UserSettingsProvider';
import AgentProvider from './contexts/AgentContext/AgentProvider';
import ErrorReportProvider from './contexts/ErrorReportContext/ErrorReportProvider';
import ErrorDisplay from './components/ErrorDisplay';
import Profiles from './components/Profiles';
import settingNotes from './utils/settingsNotes';

export default function App() {
  return (
    <ErrorReportProvider>
      <UserSettingsProvider>
        <AgentProvider>
          <div className="container">
            <h1>MinePal Control Panel</h1>
            <Settings />
            <label htmlFor="profiles">
              Your pals:
              {settingNotes.pal_message && <span className="setting-note"> ({settingNotes.pal_message})</span>}
            </label>
            <Profiles />
            <Actions />
            <ErrorDisplay />
          </div>
        </AgentProvider>
      </UserSettingsProvider>
    </ErrorReportProvider>
  );
}
