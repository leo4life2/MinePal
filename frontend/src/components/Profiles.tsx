import { useState } from 'react';
import { saveProfiles, fetchBotMemories, deleteMemory, Memory, sendMessage } from '../utils/api';
import { Profile } from '../types/apiTypes';
import { useUserSettings } from '../contexts/UserSettingsContext/UserSettingsContext';
import './Profiles.css';
import { useAgent } from '../contexts/AgentContext/AgentContext';
import { useErrorReport } from '../contexts/ErrorReportContext/ErrorReportContext';
import { Settings as SettingsIcon } from 'react-feather';

function Profiles() {
  const { userSettings: { profiles }, updateField } = useUserSettings();
  const { selectedProfiles, toggleProfile } = useAgent();
  const { declareError } = useErrorReport();

  const [editingProfileIndex, setEditingProfileIndex] = useState<number | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile>();
  const [error, setError] = useState<string>();
  const [showMemories, setShowMemories] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryError, setMemoryError] = useState<string>();
  const [showMoreSettings, setShowMoreSettings] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const openModal = (profile = { name: '', personality: '' }, index: number | null = null) => {
    setEditingProfileIndex(index);
    setEditingProfile({ ...profile });
  };

  const closeModal = () => {
    setEditingProfile(undefined);
    setEditingProfileIndex(null);
    setError(undefined);
    setShowMemories(false);
    setMemories([]);
    setMemoryError(undefined);
  };

  const viewMemories = async () => {
    if (!editingProfile?.name) return;
    
    try {
      const botMemories = await fetchBotMemories(editingProfile.name);
      setMemories(botMemories);
      setShowMemories(true);
      setMemoryError(undefined);
    } catch (error) {
      declareError("Memories", error);
      setMemoryError(`Failed to fetch memories: ${error}`);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!editingProfile?.name) return;

    try {
      await deleteMemory(editingProfile.name, memoryId);
      setMemories(prevMemories => prevMemories.filter(m => m.id !== memoryId));
      setMemoryError(undefined);
    } catch (error) {
      declareError("Memories", error);
      setMemoryError(`Failed to delete memory: ${error}`);
    }
  };

  const saveChanges = async () => {
    const sanitized = {
      name: editingProfile!.name.trim(),
      personality: editingProfile!.personality.trim(),
      autoMessage: editingProfile!.autoMessage?.trim() || '',
      triggerOnJoin: !!editingProfile!.triggerOnJoin,
      triggerOnRespawn: !!editingProfile!.triggerOnRespawn
    }

    if (sanitized.name === '' || sanitized.personality === '') {
      setError('Name and personality must not be empty');
      return;
    }

    if (profiles.some((p, idx) => p.name === sanitized.name && idx !== editingProfileIndex)) {
      setError('A profile with this name already exists');
      return;
    }

    const updatedProfiles = [...profiles];
    if (editingProfileIndex !== null) {
      updatedProfiles[editingProfileIndex] = sanitized;
    } else {
      updatedProfiles.push(sanitized);
    }

    console.log(updatedProfiles);
    try {
      await saveProfiles(updatedProfiles);
      updateField("profiles", updatedProfiles);
      closeModal();
    } catch (error) {
      declareError("Profiles", error);
      setError(`Failed to save profiles: ${error}`);
    }
  };

  const deleteProfile = async () => {
    if (editingProfileIndex === null) return;

    const updatedProfiles = profiles.filter((_, idx) => idx !== editingProfileIndex);
    console.log(updatedProfiles);

    try {
      await saveProfiles(updatedProfiles);
      updateField("profiles", updatedProfiles);
      closeModal();
    } catch (error) {
      declareError("Profiles", error);
      setError(`Failed to delete profile: ${error}`);
    }
  };

  const handleCheckboxClick = (_: React.ChangeEvent<HTMLInputElement>, profile: Profile) => {
    toggleProfile(profile);
  };

  const handleSendMessage = async () => {
    if (!editingProfile?.name || !customMessage.trim()) return;
    
    setSendingMessage(true);
    try {
      await sendMessage(editingProfile.name, customMessage.trim());
      setCustomMessage('');
    } catch (error) {
      declareError("Send Message", error);
    } finally {
      setSendingMessage(false);
    }
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
          <span>{profile.name}</span>
        </div>
      ))}
      <div className="profile-box empty" onClick={() => openModal()}>
        <span>+</span>
      </div>

      {editingProfile && (
        <div className="modal">
          <div className={`modal-content ${showMemories ? 'showing-memories' : ''}`}>
            {!showMemories ? (
              <>
                <div className="input-group">
                  <label className="input-label">Name</label>
                  <input
                    type="text"
                    value={editingProfile.name}
                    onChange={({ target: { value } }) => setEditingProfile((currentEditingProfile) => ({
                      ...currentEditingProfile!,
                      name: value,
                    }))}
                    placeholder="Enter pal name"
                  />
                </div>
                
                <div className="input-group">
                  <label className="input-label">Personality Description</label>
                  <textarea
                    value={editingProfile.personality}
                    onChange={({ target: { value } }) => setEditingProfile((currentEditingProfile) => ({
                      ...currentEditingProfile!,
                      personality: value,
                    }))}
                    placeholder="Describe your pal's personality"
                  />
                </div>
                
                <button 
                  className="more-settings-toggle"
                  onClick={() => setShowMoreSettings(!showMoreSettings)}
                  aria-expanded={showMoreSettings}
                >
                  <SettingsIcon size={18} />
                  <span>More Settings</span>
                  <div className={`arrow ${showMoreSettings ? 'expanded' : ''}`}>▼</div>
                </button>

                {showMoreSettings && (
                  <div className="more-settings-content">
                    <div className="automated-messages-group">
                      <div className="input-group">
                        <label className="input-label">Automated Messages</label>
                        <div className="message-input">
                          <input
                            type="text"
                            value={editingProfile?.autoMessage || ''}
                            onChange={({ target: { value } }) => setEditingProfile((currentEditingProfile) => ({
                              ...currentEditingProfile!,
                              autoMessage: value,
                            }))}
                            placeholder="Message or command to send automatically"
                          />
                        </div>
                        <div className="message-triggers">
                          <label title="Best for login type commands to execute when bot joins a server">
                            <input
                              type="radio"
                              name="trigger"
                              checked={!!editingProfile?.triggerOnJoin}
                              onChange={() => setEditingProfile((currentEditingProfile) => ({
                                ...currentEditingProfile!,
                                triggerOnJoin: true,
                                triggerOnRespawn: false,
                              }))}
                            />
                            On Join
                          </label>
                          <label title="For skin commands so it automatically applies skin on each respawn">
                            <input
                              type="radio"
                              name="trigger"
                              checked={!!editingProfile?.triggerOnRespawn}
                              onChange={() => setEditingProfile((currentEditingProfile) => ({
                                ...currentEditingProfile!,
                                triggerOnJoin: false,
                                triggerOnRespawn: true,
                              }))}
                            />
                            On Each Spawn
                          </label>
                          <label title="No automatic messages will be sent">
                            <input
                              type="radio"
                              name="trigger"
                              checked={!editingProfile?.triggerOnJoin && !editingProfile?.triggerOnRespawn}
                              onChange={() => setEditingProfile((currentEditingProfile) => ({
                                ...currentEditingProfile!,
                                triggerOnJoin: false,
                                triggerOnRespawn: false,
                              }))}
                            />
                            Disabled
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="bot-say-group">
                      <div className="input-group">
                        <label className="input-label">Bot Say</label>
                        <div className="message-input">
                          <input
                            type="text"
                            value={customMessage}
                            onChange={(e) => setCustomMessage(e.target.value)}
                            placeholder="Send messages in the game's chat as the bot"
                          />
                        </div>
                        <button 
                          className="send-message-button" 
                          onClick={handleSendMessage}
                          disabled={sendingMessage || !customMessage.trim()}
                        >
                          {sendingMessage ? 'Sending...' : 'Send'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="button-group">
                  <button className="save-button" onClick={saveChanges}>Save</button>
                  {editingProfileIndex !== null && (
                    <button className="view-memories-button" onClick={viewMemories}>View Memories</button>
                  )}
                  <button className="cancel-button" onClick={closeModal}>Cancel</button>
                  {editingProfileIndex !== null && (
                    <button className="delete-button" onClick={deleteProfile}>Delete Pal</button>
                  )}
                </div>
                {error && <div className="error-message">{error}</div>}
              </>
            ) : (
              <div className="memories-modal">
                <h3>Memories for {editingProfile.name}</h3>
                <div className="memories-table">
                  {memories.length > 0 ? (
                    memories.map((memory) => (
                      <div key={memory.id} className="memory-row">
                        <div className="memory-text">{memory.text}</div>
                        <button 
                          className="delete-memory-button"
                          onClick={() => handleDeleteMemory(memory.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="no-memories">No memories found</div>
                  )}
                </div>
                <div className="button-group">
                  <button className="back-button" onClick={() => setShowMemories(false)}>Back</button>
                </div>
                {memoryError && <div className="error-message">{memoryError}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Profiles;
