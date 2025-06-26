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
import pkg from '../../package.json';
import { useState } from 'react';

export default function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('Controls');

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  return (
    <SupabaseProvider>
      <ErrorReportProvider>
        <ThemeProvider>
          <UserSettingsProvider>
            <AgentProvider>
              <div className="app-layout">
                {/* Sidebar */}
                <div className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                  <div className="sidebar-header">
                    <button className="sidebar-toggle" onClick={toggleSidebar}>
                      {isSidebarCollapsed ? '→' : '←'}
                    </button>
                  </div>
                  
                  <div className="sidebar-content">
                    <div className="sidebar-top">
                      <button 
                        className={`sidebar-item ${activeSection === 'Controls' ? 'active' : ''}`}
                        onClick={() => setActiveSection('Controls')}
                      >
                        <span className="sidebar-icon">⚙️</span>
                        {!isSidebarCollapsed && <span>Controls</span>}
                      </button>
                      <button 
                        className={`sidebar-item ${activeSection === 'Imagine' ? 'active' : ''}`}
                        onClick={() => setActiveSection('Imagine')}
                      >
                        <span className="sidebar-icon">✨</span>
                        {!isSidebarCollapsed && <span>Imagine</span>}
                      </button>
                    </div>
                    
                    <div className="sidebar-bottom">
                      <button className="sidebar-item">
                        <span className="sidebar-icon">👤</span>
                        {!isSidebarCollapsed && <span>Account</span>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className={`main-content ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
                  <div className="container">
                    <ThemeToggle />
                    <h1>
                      MinePal {activeSection} <small>v{pkg.version}</small>
                    </h1>
                    
                    {activeSection === 'Controls' && (
                      <>
                        <Announcement />
                        <label htmlFor="profiles" className="input-label">
                          Choose Your Pals
                          {settingNotes.pal_message && <span className="setting-note"> ({settingNotes.pal_message})</span>}
                        </label>
                        <Profiles />
                        <Settings />
                        <Actions />
                        <ErrorDisplay />
                        <Footer />
                      </>
                    )}
                    
                    {activeSection === 'Imagine' && (
                      <div className="imagine-section">
                        <p>Imagine section - Coming soon!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </AgentProvider>
          </UserSettingsProvider>
        </ThemeProvider>
      </ErrorReportProvider>
    </SupabaseProvider>
  );
}
