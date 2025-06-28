import './App.css';
import UserSettingsProvider from './contexts/UserSettingsContext/UserSettingsProvider';
import AgentProvider from './contexts/AgentContext/AgentProvider';
import ErrorReportProvider from './contexts/ErrorReportContext/ErrorReportProvider';
import SupabaseProvider from './contexts/SupabaseContext/SupabaseProvider';
import ThemeProvider from './contexts/ThemeContext/ThemeProvider';
import ThemeToggle from './components/ThemeToggle/ThemeToggle';
import ControlsPage from './components/ControlsPage';
import ImaginePage from './components/ImaginePage';
import pkg from '../../package.json';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Sliders, Star, BookOpen } from 'react-feather';

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
                      {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>
                  </div>
                  
                  <div className="sidebar-content">
                    <div className="sidebar-top">
                      <button 
                        className={`sidebar-item ${activeSection === 'Controls' ? 'active' : ''}`}
                        onClick={() => setActiveSection('Controls')}
                      >
                        <Sliders className="sidebar-icon" size={16} />
                        <div className="sidebar-text-container">
                          <span>Controls</span>
                        </div>
                      </button>
                      <button 
                        className={`sidebar-item ${activeSection === 'Imagine' ? 'active' : ''}`}
                        onClick={() => setActiveSection('Imagine')}
                      >
                        <Star className="sidebar-icon" size={16} />
                        <div className="sidebar-text-container">
                          <span>Imagine</span>
                        </div>
                      </button>
                    </div>
                    
                    <div className="sidebar-bottom">
                      <button 
                        className="sidebar-item"
                        onClick={() => window.open('https://minepal.net/guides', '_blank')}
                      >
                        <BookOpen className="sidebar-icon" size={16} />
                        <div className="sidebar-text-container">
                          <span>Guides</span>
                        </div>
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
                    
                    {activeSection === 'Controls' && <ControlsPage />}
                    {activeSection === 'Imagine' && <ImaginePage />}
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
