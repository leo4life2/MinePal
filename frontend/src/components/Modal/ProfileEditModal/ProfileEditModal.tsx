import { useState, useCallback } from 'react';
import { sendMessage } from '../../../utils/api';
import { Profile } from '../../../types/apiTypes';
import { X as CloseIcon } from 'react-feather';
import './ProfileEditModal.css';
import { ModalWrapper, PricingModal } from '..';
import { ProfileSettingsSection } from '../../ProfileSettings/ProfileSettings';
import VoiceSelector, { VoiceOption } from '../../VoiceSelector/VoiceSelector';
import TierBox from '../../TierBox/TierBox';
import { TierType } from '../../../constants';
import { useSupabase } from '../../../contexts/SupabaseContext/useSupabase';

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
  onError,
}: ProfileEditModalProps) {
  const [editingProfile, setEditingProfile] = useState<Profile>({ 
    ...profile
  });
  const [error, setError] = useState<string>();
  const [customMessage, setCustomMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const { userPlan, getCustomerPortal } = useSupabase();

  const handleVoiceSettingChange = async (updateFunc: () => void) => {
    if (userPlan === 'FREE') {
      setShowPricingModal(true);
      setPortalError(null);
    } else if (userPlan === 'BASIC') {
      setPortalError(null);
      try {
        await getCustomerPortal('update');
      } catch (err) {
        console.error('Error opening customer portal:', err);
        setPortalError(err instanceof Error ? err.message : 'Failed to open customer portal.');
      }
    } else {
      updateFunc();
      setPortalError(null);
    }
  };

  const isDirty = useCallback(() => {
    // For a new profile, check if any significant fields have been filled from their initial empty/default state.
    // A new profile (passed via 'profile' prop) typically starts with name: '', personality: '', and other fields undefined.
    if (isNewProfile) {
        return (
            editingProfile.name.trim() !== (profile.name || '') ||
            editingProfile.personality.trim() !== (profile.personality || '') ||
            (editingProfile.autoMessage?.trim() || '') !== (profile.autoMessage?.trim() || '') ||
            !!editingProfile.triggerOnJoin !== !!profile.triggerOnJoin ||
            !!editingProfile.triggerOnRespawn !== !!profile.triggerOnRespawn ||
            !!editingProfile.enable_voice !== !!profile.enable_voice || 
            (editingProfile.base_voice_id ?? AVAILABLE_VOICE_OPTIONS[0]?.id) !== (profile.base_voice_id ?? AVAILABLE_VOICE_OPTIONS[0]?.id) ||
            !!editingProfile.voice_only_mode !== !!profile.voice_only_mode ||
            !!editingProfile.enable_rare_finds !== !!profile.enable_rare_finds ||
            !!editingProfile.enable_entity_sleep !== !!profile.enable_entity_sleep ||
            !!editingProfile.enable_entity_hurt !== !!profile.enable_entity_hurt ||
            !!editingProfile.enable_silence_timer !== !!profile.enable_silence_timer ||
            !!editingProfile.enable_weather_listener !== !!profile.enable_weather_listener
        );
    }

    // For an existing profile, compare current editingProfile state with the original profile prop.
    return (
        editingProfile.name.trim() !== profile.name.trim() ||
        editingProfile.personality.trim() !== profile.personality.trim() ||
        (editingProfile.autoMessage?.trim() || '') !== (profile.autoMessage?.trim() || '') ||
        !!editingProfile.triggerOnJoin !== !!profile.triggerOnJoin ||
        !!editingProfile.triggerOnRespawn !== !!profile.triggerOnRespawn ||
        !!editingProfile.enable_voice !== !!profile.enable_voice ||
        (editingProfile.base_voice_id ?? AVAILABLE_VOICE_OPTIONS[0]?.id) !== (profile.base_voice_id ?? AVAILABLE_VOICE_OPTIONS[0]?.id) ||
        !!editingProfile.voice_only_mode !== !!profile.voice_only_mode ||
        !!editingProfile.enable_rare_finds !== !!profile.enable_rare_finds ||
        !!editingProfile.enable_entity_sleep !== !!profile.enable_entity_sleep ||
        !!editingProfile.enable_entity_hurt !== !!profile.enable_entity_hurt ||
        !!editingProfile.enable_silence_timer !== !!profile.enable_silence_timer ||
        !!editingProfile.enable_weather_listener !== !!profile.enable_weather_listener
    );
  }, [editingProfile, profile, isNewProfile]);

  const handleAttemptClose = () => {
    if (showDeleteConfirm) {
        return;
    }
    if (isDirty()) {
      setShowUnsavedConfirm(true);
      setShowDeleteConfirm(false);
    } else {
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setShowUnsavedConfirm(false);
    onClose();
  };

  const handleCancelDiscard = () => {
    setShowUnsavedConfirm(false);
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
      voice_only_mode: !!editingProfile.voice_only_mode,
      enable_rare_finds: !!editingProfile.enable_rare_finds,
      enable_entity_sleep: !!editingProfile.enable_entity_sleep,
      enable_entity_hurt: !!editingProfile.enable_entity_hurt,
      enable_silence_timer: !!editingProfile.enable_silence_timer,
      enable_weather_listener: !!editingProfile.enable_weather_listener,
    };

    if (sanitized.name === '' || sanitized.personality === '') {
      setError('Name and personality must not be empty');
      return;
    }

    try {
      setError(undefined);
      setShowUnsavedConfirm(false);
      setShowDeleteConfirm(false);
      await onSave(sanitized);
      // onClose will be called by parent component after saving
    } catch (error) {
      setError(`Failed to save profile: ${error}`);
    }
  };

  const handleDeleteWithConfirmation = async () => {
    setShowDeleteConfirm(true);
    setShowUnsavedConfirm(false);
  };

  const executeDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await onDelete();
      // onClose will be called by parent component after deleting successfully
    } catch (e) {
      setError(`Failed to delete profile: ${e}`);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
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
    <ModalWrapper onClose={handleAttemptClose}>
      <div className={`modal-content profile-modal`}>
        <button className="modal-close-icon" onClick={handleAttemptClose} disabled={showDeleteConfirm || showUnsavedConfirm}>
          <CloseIcon size={18} />
        </button>
        
        {showUnsavedConfirm ? (
          <div className="confirm-dialog unsaved-confirm-dialog">
            <p>You have unsaved changes. Are you sure you want to discard them?</p>
            <div className="button-group">
              <button className="discard-button error-button" onClick={handleConfirmDiscard}>Discard</button>
              <button className="cancel-button secondary-button" onClick={handleCancelDiscard}>Cancel</button>
            </div>
          </div>
        ) : showDeleteConfirm ? (
          <div className="confirm-dialog delete-confirm-dialog">
            <p>{`Are you sure you want to delete the Pal "${editingProfile.name}"? This action cannot be undone.`}</p>
            <div className="button-group">
              <button className="delete-button error-button" onClick={executeDelete}>Delete</button>
              <button className="cancel-button secondary-button" onClick={cancelDelete}>Cancel</button>
            </div>
          </div>
        ) : (
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
                placeholder="Pal's name"
              />
            </div>
            
            <div className="input-group">
              <label className="input-label">Identity Prompt</label>
              <textarea
                value={editingProfile.personality}
                onChange={({ target: { value } }) => setEditingProfile((current) => ({
                  ...current,
                  personality: value,
                }))}
                placeholder="Your Pal's identity prompt shapes its behavior and interactions. Start by giving your Pal a clear role or background—think of who or what they are. Next, set a unique communication style, whether casual, formal, quirky, or humorous. Clearly outline their personality traits to define how they react and interact. Don't worry about getting it perfect right away—you can always come back and fine-tune your Pal's personality whenever you like!"
              />
            </div>
          </div>
            
            <div className="profile-settings-sections-container">
              <ProfileSettingsSection 
                title={(
                  <span className="profile-section-title-container">
                    Pal Voice
                    <TierBox tier={'STANDARD' as TierType} />
                    <TierBox tier={'PRO' as TierType} />
                  </span>
                )}
                isExpanded={false}
              >
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
                          onChange={(e) => {
                            handleVoiceSettingChange(() => {
                              setEditingProfile((current) => ({
                                ...current,
                                enable_voice: e.target.checked,
                              }));
                            });
                          }}
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
                          onChange={(e) => {
                            handleVoiceSettingChange(() => {
                              setEditingProfile((current) => ({
                                ...current,
                                voice_only_mode: e.target.checked,
                              }));
                            });
                          }}
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
                      onChange={(id) => {
                        handleVoiceSettingChange(() => {
                          setEditingProfile(current => ({ ...current, base_voice_id: id }));
                        });
                      }}
                      placeholder="Select base voice"
                    />
                  </div>
              </div>
            </ProfileSettingsSection>

            <ProfileSettingsSection title="Awareness Settings" isExpanded={false}>
              <div className="voice-settings-group">
                <div className="profile-setting-item">
                  <label className="sub-input-label">Rare Finds Alerts</label>
                  <div className="profile-switch-container">
                    <label className="profile-switch">
                      <input
                        type="checkbox"
                        checked={!!editingProfile.enable_rare_finds}
                        onChange={(e) =>
                          setEditingProfile((current) => ({
                            ...current,
                            enable_rare_finds: e.target.checked,
                          }))
                        }
                      />
                      <span className="profile-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="profile-setting-item">
                  <label className="sub-input-label">Player Sleep Alerts</label>
                  <div className="profile-switch-container">
                    <label className="profile-switch">
                      <input
                        type="checkbox"
                        checked={!!editingProfile.enable_entity_sleep}
                        onChange={(e) =>
                          setEditingProfile((current) => ({
                            ...current,
                            enable_entity_sleep: e.target.checked,
                          }))
                        }
                      />
                      <span className="profile-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="profile-setting-item">
                  <label className="sub-input-label">Player Hurt Alerts</label>
                  <div className="profile-switch-container">
                    <label className="profile-switch">
                      <input
                        type="checkbox"
                        checked={!!editingProfile.enable_entity_hurt}
                        onChange={(e) =>
                          setEditingProfile((current) => ({
                            ...current,
                            enable_entity_hurt: e.target.checked,
                          }))
                        }
                      />
                      <span className="profile-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="profile-setting-item">
                  <label className="sub-input-label">Breaks Silences</label>
                  <div className="profile-switch-container">
                    <label className="profile-switch">
                      <input
                        type="checkbox"
                        checked={!!editingProfile.enable_silence_timer}
                        onChange={(e) =>
                          setEditingProfile((current) => ({
                            ...current,
                            enable_silence_timer: e.target.checked,
                          }))
                        }
                      />
                      <span className="profile-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="profile-setting-item">
                  <label className="sub-input-label">Weather Alerts</label>
                  <div className="profile-switch-container">
                    <label className="profile-switch">
                      <input
                        type="checkbox"
                        checked={!!editingProfile.enable_weather_listener}
                        onChange={(e) =>
                          setEditingProfile((current) => ({
                            ...current,
                            enable_weather_listener: e.target.checked,
                          }))
                        }
                      />
                      <span className="profile-slider"></span>
                    </label>
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
                      <label title="Best for login type commands to execute when Pal joins a server">
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
                    <label className="sub-input-label">Pal Say</label>
                    <div className="message-input">
                      <input
                        type="text"
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        placeholder="Send messages in the game's chat as the Pal"
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
              <button className="save-button save-button--primary" onClick={handleSaveChanges}>Save</button>
            </div>
            
            {!isNewProfile && (
              <div className="danger-zone">
                <div className="danger-zone-content">
                  <div className="danger-zone-item">
                    <div className="danger-zone-text">
                      <strong>Delete this Pal</strong>
                      <p>Once you delete a Pal, there is no going back. Please be certain.</p>
                    </div>
                    <button className="delete-button delete-button--danger" onClick={handleDeleteWithConfirmation}>Delete Pal</button>
                  </div>
                </div>
              </div>
            )}
            
            {error && <div className="error-message">{error}</div>}
            {portalError && <div className="error-message">{portalError}</div>}
          </>
        )}
        {showPricingModal && (
          <PricingModal onClose={() => {
            setShowPricingModal(false);
            setPortalError(null);
          }} />
        )}
      </div>
    </ModalWrapper>
  );
}

export default ProfileEditModal; 