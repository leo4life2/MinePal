import { useState, ReactNode } from 'react';
import { ChevronDown } from 'react-feather';
import './ProfileSettings.css'; // This path remains correct as it's relative to the new location

interface ProfileSettingsSectionProps {
  title: string;
  isExpanded?: boolean;
  children: ReactNode;
}

function ProfileSettingsSection({ 
  title, 
  isExpanded: defaultExpanded = false, 
  children 
}: ProfileSettingsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className="profile-settings-section">
      <button 
        className={`profile-section-toggle ${isExpanded ? 'expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span>{title}</span>
        <ChevronDown className={`profile-arrow ${isExpanded ? 'expanded' : ''}`} size={16} strokeWidth={2.5} />
      </button>
      
      {isExpanded && (
        <div className="profile-section-content">
          {children}
        </div>
      )}
    </div>
  );
}

export { ProfileSettingsSection };
export type { ProfileSettingsSectionProps }; 