import { useState, useEffect } from 'react';
import './Profiles.css';

function Profiles({ profiles, setSettings, handleProfileSelect, selectedProfiles, api }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [currentProfileIndex, setCurrentProfileIndex] = useState(null);
  const [editableName, setEditableName] = useState('');
  const [editablePersonality, setEditablePersonality] = useState('');
  const [editableChatMessage, setEditableChatMessage] = useState('');
  const [error, setError] = useState(null);

  const sendMessage = async (message) => {
    try {
      await api.post('/manual-chat', {
        botName: editableName,
        message: message
      });
      setEditableChatMessage(''); // Clear the message input after sending
    } catch (error) {
      console.error("Failed to send message:", error);
      setError(`Failed to send message. ${error.response?.data?.error || ''}`);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && modalOpen) {
        sendMessage(editableChatMessage);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modalOpen, editableChatMessage]);

  const openModal = (profile = { name: '', personality: '' }, index = null) => {
    setCurrentProfileIndex(index);
    setEditableName(profile.name);
    setEditablePersonality(profile.personality);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentProfileIndex(null);
    setError(null); // Clear error on modal close
  };

  const saveChanges = async () => {
    if (editableName.trim() === '' || editablePersonality.trim() === '') {
      alert('Name and personality must not be empty');
      return;
    }

    if (profiles.some((p, idx) => p.name === editableName && idx !== currentProfileIndex)) {
      alert('A profile with this name already exists');
      return;
    }

    const updatedProfiles = [...profiles];
    if (currentProfileIndex !== null) {
      updatedProfiles[currentProfileIndex] = { name: editableName, personality: editablePersonality };
    } else {
      updatedProfiles.push({ name: editableName, personality: editablePersonality });
    }

    console.log(updatedProfiles);

    try {
      await api.post('/save-profiles', { profiles: updatedProfiles });
      setSettings(prev => ({ ...prev, profiles: updatedProfiles }));
      closeModal();
    } catch (error) {
      console.error("Failed to save profiles:", error);
      alert("Failed to save profiles. Please try again.");
    }
  };

  const deleteProfile = async () => {
    if (currentProfileIndex === null) return;

    const updatedProfiles = profiles.filter((_, idx) => idx !== currentProfileIndex);
    console.log(updatedProfiles);

    try {
      await api.post('/save-profiles', { profiles: updatedProfiles });
      setSettings(prev => ({ ...prev, profiles: updatedProfiles }));
      closeModal();
    } catch (error) {
      console.error("Failed to delete profile:", error);
      alert("Failed to delete profile. Please try again.");
    }
  };

  const handleCheckboxClick = (e, profile) => {
    e.stopPropagation();
    handleProfileSelect(profile);
  };

  const renderProfileBox = (profile, index) => (
    <div key={index} className="profile-box" onClick={() => openModal(profile, index)}>
      <input
        type="checkbox"
        checked={selectedProfiles.some(p => p.name === profile.name)}
        onClick={(e) => handleCheckboxClick(e, profile)}
      />
      <span>{profile.name}</span>
    </div>
  );

  const renderEmptyBox = (index) => (
    <div key={index} className="profile-box empty" onClick={() => openModal()}>
      <span>+</span>
    </div>
  );

  return (
    <div className="profiles">
      {profiles.map((profile, index) => renderProfileBox(profile, index))}
      {renderEmptyBox(profiles.length)}

      {modalOpen && (
        <div className="modal">
          <div className="modal-content">
            <input
              type="text"
              value={editableName}
              onChange={(e) => setEditableName(e.target.value)}
              placeholder="Name"
            />
            <textarea
              value={editablePersonality}
              onChange={(e) => setEditablePersonality(e.target.value)}
              placeholder="Personality"
            />
            <div className="send-group">
              <input
                type="text"
                value={editableChatMessage}
                onChange={(e) => setEditableChatMessage(e.target.value)}
                placeholder="Send messages in the game's chat as the bot"
              />
              <button className="send-button" onClick={() => sendMessage(editableChatMessage)}>Send</button>
            </div>
            <div className="button-group">
              <button className="save-button" onClick={saveChanges}>Save</button>
              <button className="cancel-button" onClick={closeModal}>Cancel</button>
              {currentProfileIndex !== null && (
                <button className="delete-button" onClick={deleteProfile}>Delete Pal</button>
              )}
            </div>
            {error && <div className="error-message">{error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default Profiles;