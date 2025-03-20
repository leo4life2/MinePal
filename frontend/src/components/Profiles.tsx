import { useState } from 'react';
import { saveProfiles } from '../utils/api';
import { Profile } from '../types/apiTypes';
import { useUserSettings } from '../contexts/UserSettingsContext/UserSettingsContext';
import './Profiles.css';
import { useAgent } from '../contexts/AgentContext/AgentContext';
import { useErrorReport } from '../contexts/ErrorReportContext/ErrorReportContext';
import { ProfileEditModal } from './Modal';
import { Edit3 as EditIcon } from 'react-feather';

function Profiles() {
  const { userSettings: { profiles }, updateField } = useUserSettings();
  const { selectedProfiles, toggleProfile } = useAgent();
  const { declareError } = useErrorReport();

  const [editingProfileIndex, setEditingProfileIndex] = useState<number | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile>();

  const openModal = (profile = { name: '', personality: '' }, index: number | null = null) => {
    setEditingProfileIndex(index);
    setEditingProfile({ ...profile });
  };

  const closeModal = () => {
    setEditingProfile(undefined);
    setEditingProfileIndex(null);
  };

  const handleSaveProfile = async (profileToSave: Profile) => {
    if (profiles.some((p, idx) => p.name === profileToSave.name && idx !== editingProfileIndex)) {
      throw new Error('A profile with this name already exists');
    }

    const updatedProfiles = [...profiles];
    if (editingProfileIndex !== null) {
      updatedProfiles[editingProfileIndex] = profileToSave;
    } else {
      updatedProfiles.push(profileToSave);
    }

    await saveProfiles(updatedProfiles);
    updateField("profiles", updatedProfiles);
    closeModal();
  };

  const handleDeleteProfile = async () => {
    if (editingProfileIndex === null) return;

    const updatedProfiles = profiles.filter((_, idx) => idx !== editingProfileIndex);

    await saveProfiles(updatedProfiles);
    updateField("profiles", updatedProfiles);
    closeModal();
  };

  const handleCheckboxClick = (_: React.ChangeEvent<HTMLInputElement>, profile: Profile) => {
    toggleProfile(profile);
  };

  return (
    <div className="profiles">
      {profiles.map((profile, index) => (
        <div key={index} className="profile-box" onClick={() => openModal(profile, index)}>
          <input
            type="checkbox"
            checked={selectedProfiles.some(p => p.name === profile.name)}
            onChange={(e) => handleCheckboxClick(e, profile)}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="profile-name">{profile.name}</span>
          <EditIcon size={16} className="edit-icon" />
        </div>
      ))}
      <div className="profile-box empty" onClick={() => openModal()}>
        <span>+</span>
      </div>

      {editingProfile && (
        <ProfileEditModal
          profile={editingProfile}
          isNewProfile={editingProfileIndex === null}
          onSave={handleSaveProfile}
          onDelete={handleDeleteProfile}
          onClose={closeModal}
          onError={(section, error) => declareError(section, error)}
        />
      )}
    </div>
  );
}

export default Profiles;
