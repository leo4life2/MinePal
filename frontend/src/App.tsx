import './App.css';
import Settings from './components/Settings/Settings';
import Actions from './components/Actions/Actions';
import UserSettingsProvider from './contexts/UserSettingsContext/UserSettingsProvider';
import AgentProvider from './contexts/AgentContext/AgentProvider';
import ErrorReportProvider from './contexts/ErrorReportContext/ErrorReportProvider';
import SupabaseProvider from './contexts/SupabaseContext/SupabaseProvider';
import ErrorDisplay from './components/ErrorDisplay';
import Profiles from './components/Profiles';
import Footer from './components/Footer/Footer';
import settingNotes from './utils/settingsNotes';
import Announcement from './components/Announcement';
import ThemeProvider from './contexts/ThemeContext/ThemeProvider';
import ThemeToggle from './components/ThemeToggle/ThemeToggle';

export default function App() {
  return (
    <SupabaseProvider>
      <ErrorReportProvider>
        <ThemeProvider>
          <UserSettingsProvider>
            <AgentProvider>
              <div className="container">
                <ThemeToggle />
                <h1>MinePal Control Panel</h1>
                <Announcement />
                <label htmlFor="profiles">
                  your pals:
                  {settingNotes.pal_message && <span className="setting-note"> ({settingNotes.pal_message})</span>}
                </label>
                <Profiles />
                <Settings />
                <Actions />
                <ErrorDisplay />
                <Footer />
              </div>
            </AgentProvider>
          </UserSettingsProvider>
        </ThemeProvider>
      </ErrorReportProvider>
    </SupabaseProvider>
  );
}
