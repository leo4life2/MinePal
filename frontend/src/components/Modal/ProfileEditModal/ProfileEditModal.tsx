import { useState } from 'react';
import { Memory, deleteMemory, fetchBotMemories, sendMessage } from '../../../utils/api';
import { Profile } from '../../../types/apiTypes';
import { X as CloseIcon, Trash2 } from 'react-feather';
import './ProfileEditModal.css';
import { ModalWrapper } from '..';
import { ProfileSettingsSection } from '../../ProfileSettings/ProfileSettings';
import VoiceSelector, { VoiceOption } from '../../VoiceSelector/VoiceSelector';

// Renamed voice options constant
const AVAILABLE_VOICE_OPTIONS: VoiceOption[] = [
  { id: 'alloy', name: 'Alloy', audioUrl: 'https://cdn.openai.com/API/voice-previews/alloy.flac' },
  { id: 'ash', name: 'Ash', audioUrl: 'https://cdn.openai.com/API/voice-previews/ash.flac' },
  { id: 'ballad', name: 'Ballad', audioUrl: 'https://cdn.openai.com/API/voice-previews/ballad.flac' },
  { id: 'coral', name: 'Coral', audioUrl: 'https://cdn.openai.com/API/voice-previews/coral.flac' },
  { id: 'echo', name: 'Echo', audioUrl: 'https://cdn.openai.com/API/voice-previews/echo.flac' },
  { id: 'fable', name: 'Fable', audioUrl: 'https://cdn.openai.com/API/voice-previews/fable.flac' },
  { id: 'onyx', name: 'Onyx', audioUrl: 'https://cdn.openai.com/API/voice-previews/onyx.flac' },
  { id: 'nova', name: 'Nova', audioUrl: 'https://cdn.openai.com/API/voice-previews/nova.flac' },
  { id: 'sage', name: 'Sage', audioUrl: 'https://cdn.openai.com/API/voice-previews/sage.flac' },
  { id: 'shimmer', name: 'Shimmer', audioUrl: 'https://cdn.openai.com/API/voice-previews/shimmer.flac' },
  { id: 'verse', name: 'Verse', audioUrl: 'https://cdn.openai.com/API/voice-previews/verse.flac' },
];

interface ProfileEditModalProps {
  profile: Profile;
  isNewProfile: boolean;
  onSave: (profile: Profile) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  onError: (section: string, error: unknown) => void;
}

function ProfileEditModal({ 
  profile, 
  isNewProfile, 
  onSave, 
  onDelete, 
  onClose, 
  onError 
}: ProfileEditModalProps) {
  const [editingProfile, setEditingProfile] = useState<Profile>({ 
    ...profile, 
    enable_voice: profile.enable_voice ?? false,
    base_voice_id: profile.base_voice_id ?? AVAILABLE_VOICE_OPTIONS[0]?.id,
    tone_and_style: profile.tone_and_style ?? '',
    voice_only_mode: profile.voice_only_mode ?? false,
  });
  const [error, setError] = useState<string>();
  const [showMemories, setShowMemories] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryError, setMemoryError] = useState<string>();
  const [customMessage, setCustomMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const viewMemories = async () => {
    if (!editingProfile?.name) return;
    
    try {
      const botMemories = await fetchBotMemories(editingProfile.name);
      setMemories(botMemories);
      setShowMemories(true);
      setMemoryError(undefined);
    } catch (error) {
      onError("Memories", error);
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
      onError("Memories", error);
      setMemoryError(`Failed to delete memory: ${error}`);
    }
  };

  const handleSaveChanges = async () => {
    const sanitized = {
      name: editingProfile.name.trim(),
      personality: editingProfile.personality.trim(),
      autoMessage: editingProfile.autoMessage?.trim() || '',
      triggerOnJoin: !!editingProfile.triggerOnJoin,
      triggerOnRespawn: !!editingProfile.triggerOnRespawn,
      enable_voice: !!editingProfile.enable_voice,
      base_voice_id: editingProfile.base_voice_id,
      tone_and_style: editingProfile.tone_and_style?.trim() ?? '',
      voice_only_mode: !!editingProfile.voice_only_mode,
    };

    if (sanitized.name === '' || sanitized.personality === '') {
      setError('Name and personality must not be empty');
      return;
    }

    try {
      await onSave(sanitized);
      // onClose will be called by parent component after saving
    } catch (error) {
      setError(`Failed to save profile: ${error}`);
    }
  };

  const handleSendMessage = async () => {
    if (!editingProfile?.name || !customMessage.trim()) return;
    
    setSendingMessage(true);
    try {
      await sendMessage(editingProfile.name, customMessage.trim());
      setCustomMessage('');
    } catch (error) {
      onError("Send Message", error);
    } finally {
      setSendingMessage(false);
    } 
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className={`modal-content profile-modal ${showMemories ? 'showing-memories' : ''}`}>
        <button className="modal-close-icon" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        
        {!showMemories ? (
          <>
          <div className="input-groups-container">
            <div className="input-group">
              <label className="input-label">Name</label>
              <input
                type="text"
                value={editingProfile.name}
                onChange={({ target: { value } }) => setEditingProfile((current) => ({
                  ...current,
                  name: value,
                }))}
                placeholder="Enter pal name"
              />
            </div>
            
            <div className="input-group">
              <label className="input-label">Personality Description</label>
              <textarea
                value={editingProfile.personality}
                onChange={({ target: { value } }) => setEditingProfile((current) => ({
                  ...current,
                  personality: value,
                }))}
                placeholder="Describe your pal\'s personality"
              />
            </div>
          </div>
            
            <div className="profile-settings-sections-container">
              <ProfileSettingsSection title="Pal Voice" isExpanded={false}>
                <div className="voice-settings-group">
                  <div className="profile-setting-item">
                    <label className="sub-input-label">
                      Enable Voice
                    </label>
                    <div className="profile-switch-container">
                      <label className="profile-switch">
                        <input
                          type="checkbox"
                          checked={!!editingProfile.enable_voice}
                          onChange={(e) => setEditingProfile((current) => ({
                            ...current,
                            enable_voice: e.target.checked,
                          }))}
                        />
                        <span className="profile-slider"></span>
                      </label>
                    </div>
                  </div>

                  <div className="profile-setting-item">
                    <label className="sub-input-label">
                      Voice-Only Mode
                    </label>
                    <div className="profile-switch-container">
                      <label className="profile-switch">
                        <input
                          type="checkbox"
                          checked={!!editingProfile.voice_only_mode}
                          onChange={(e) => setEditingProfile((current) => ({
                            ...current,
                            voice_only_mode: e.target.checked,
                          }))}
                        />
                        <span className="profile-slider"></span>
                      </label>
                    </div>
                  </div>

                  <div className="profile-setting-item profile-setting-item--stacked">
                    <label className="sub-input-label">
                      Base Voice
                    </label>
                    <VoiceSelector 
                      options={AVAILABLE_VOICE_OPTIONS}
                      selectedId={editingProfile.base_voice_id}
                      onChange={(id) => setEditingProfile(current => ({ ...current, base_voice_id: id }))}
                      placeholder="Select base voice"
                    />
                  </div>

                  <div className="profile-setting-item profile-setting-item--stacked">
                    <label htmlFor="tone-style-input" className="sub-input-label">
                      Tone & Style
                    </label>
                    <div className="message-input">
                      <input
                        id="tone-style-input"
                        type="text"
                        value={editingProfile.tone_and_style}
                        onChange={(e) => setEditingProfile(current => ({ ...current, tone_and_style: e.target.value }))}
                        placeholder="e.g., calm and friendly, or excited and energetic"
                      />
                    </div>
                  </div>
                </div>
              </ProfileSettingsSection>

              <ProfileSettingsSection title="Messaging" isExpanded={false}>
                <div className="automated-messages-group">
                  <div className="input-group">
                    <label className="sub-input-label">Auto Message</label>
                    <div className="message-input">
                      <input
                        type="text"
                        value={editingProfile?.autoMessage || ''}
                        onChange={({ target: { value } }) => setEditingProfile((current) => ({
                          ...current,
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
                          onChange={() => setEditingProfile((current) => ({
                            ...current,
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
                          onChange={() => setEditingProfile((current) => ({
                            ...current,
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
                          onChange={() => setEditingProfile((current) => ({
                            ...current,
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
                    <label className="sub-input-label">Bot Say</label>
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
              </ProfileSettingsSection>
            </div>

            <div className="button-group">
              <button className="save-button" onClick={handleSaveChanges}>Save</button>
              {!isNewProfile && (
                <button className="view-memories-button" onClick={viewMemories}>View Memories</button>
              )}
              {!isNewProfile && (
                <button className="delete-button" onClick={onDelete}>Delete Pal</button>
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
                      <Trash2 size={16} />
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
    </ModalWrapper>
  );
}

export default ProfileEditModal; 