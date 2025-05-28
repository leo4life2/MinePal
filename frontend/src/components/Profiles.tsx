import { useState } from 'react';
import { saveProfiles, Memory, fetchBotMemories, deleteMemory } from '../utils/api';
import { Profile } from '../types/apiTypes';
import { useUserSettings } from '../contexts/UserSettingsContext/UserSettingsContext';
import './Profiles.css';
import { useAgent } from '../contexts/AgentContext/AgentContext';
import { useErrorReport } from '../contexts/ErrorReportContext/ErrorReportContext';
import { ProfileEditModal, MemoriesModal, ShareToPalForgeModal } from './Modal';
import { Edit2 as EditIcon, Share2 } from 'react-feather';
// @ts-ignore
import BrainIcon from '../assets/brain.svg?react';

function Profiles() {
  const { userSettings: { profiles }, updateField } = useUserSettings();
  const { selectedProfiles, toggleProfile } = useAgent();
  const { declareError } = useErrorReport();

  const [editingProfileIndex, setEditingProfileIndex] = useState<number | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile>();
  const [viewingMemoriesProfile, setViewingMemoriesProfile] = useState<Profile | null>(null);
  const [sharingProfile, setSharingProfile] = useState<Profile | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryError, setMemoryError] = useState<string>();

  const openEditModal = (profileFromList = { name: '', personality: '' }, index: number | null = null) => {
    setEditingProfileIndex(index);
    setEditingProfile({ ...profileFromList });
    setViewingMemoriesProfile(null);
  };

  const openMemoriesModal = async (profile: Profile) => {
    setViewingMemoriesProfile(profile);
    setEditingProfile(undefined);
    setEditingProfileIndex(null);
    try {
      const botMemories = await fetchBotMemories(profile.name);
      setMemories(botMemories);
      setMemoryError(undefined);
    } catch (error) {
      declareError("Memories", error);
      setMemoryError(`Failed to fetch memories: ${error}`);
    }
  };

  const closeModal = () => {
    setEditingProfile(undefined);
    setEditingProfileIndex(null);
    setViewingMemoriesProfile(null);
  };
  
  const handleDeleteMemory = async (profileName: string, memoryId: string) => {
    if (!profileName) return;
    try {
      await deleteMemory(profileName, memoryId);
      setMemories(prevMemories => prevMemories.filter(m => m.id !== memoryId));
      setMemoryError(undefined);
    } catch (error) {
      declareError("Memories", error);
      setMemoryError(`Failed to delete memory: ${error}`);
    }
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

  const handleRowClick = (profile: Profile) => {
    toggleProfile(profile);
  };

  const handleCheckboxClick = (e: React.MouseEvent, profile: Profile) => {
    e.stopPropagation();
    toggleProfile(profile);
  };

  const handleEditClick = (e: React.MouseEvent, profile: Profile, index: number) => {
    e.stopPropagation();
    openEditModal(profile, index);
  };

  const handleMemoriesClick = (e: React.MouseEvent, profile: Profile) => {
    e.stopPropagation();
    openMemoriesModal(profile);
  };

  const handleShareClick = (e: React.MouseEvent, profile: Profile) => {
    e.stopPropagation();
    setSharingProfile(profile);
  };

  const closeShareModal = () => {
    setSharingProfile(null);
  };

  return (
    <div className="profiles">
      {profiles.map((profile, index) => (
        <div key={index} className="profile-box" onClick={() => handleRowClick(profile)}>
          <div className="profile-content">
            <input
              type="checkbox"
              checked={selectedProfiles.some(p => p.name === profile.name)}
              onChange={() => {}}
              onClick={(e) => handleCheckboxClick(e, profile)}
            />
            <span className="profile-name">{profile.name}</span>
          </div>
          <div className="profile-actions">
            <button 
              className="profile-action-button"
              onClick={(e) => handleEditClick(e, profile, index)}
              title="Edit profile"
            >
              <EditIcon size={15} />
            </button>
            <button 
              className="profile-action-button profile-action-button--memories"
              onClick={(e) => handleMemoriesClick(e, profile)}
              title="View memories"
            >
              <BrainIcon width={17} height={17} />
            </button>
            <button 
              className="profile-action-button profile-action-button--share"
              onClick={(e) => handleShareClick(e, profile)}
              title="Share"
            >
              <Share2 size={16} />
            </button>
          </div>
        </div>
      ))}
      <div className="profile-box empty" onClick={() => openEditModal()}>
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

      {viewingMemoriesProfile && (
        <MemoriesModal 
          profileName={viewingMemoriesProfile.name} 
          memories={memories} 
          memoryError={memoryError}
          onDeleteMemory={(memoryId) => handleDeleteMemory(viewingMemoriesProfile.name, memoryId)}
          onClose={closeModal} 
        />
      )}

      {sharingProfile && (
        <ShareToPalForgeModal
          profile={sharingProfile}
          onClose={closeShareModal}
        />
      )}
    </div>
  );
}

export default Profiles;
