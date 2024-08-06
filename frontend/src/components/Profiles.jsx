import React, { useState, useEffect } from 'react';

function Profiles({ profiles, setSettings, handleProfileSelect, selectedProfiles, api }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [currentProfileIndex, setCurrentProfileIndex] = useState(null);
  const [editableName, setEditableName] = useState('');
  const [editablePersonality, setEditablePersonality] = useState('');

  const openModal = (profile = { name: '', personality: '' }, index = null) => {
    setCurrentProfileIndex(index);
    setEditableName(profile.name);
    setEditablePersonality(profile.personality);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentProfileIndex(null);
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

    try {
      await api.post('/save-profiles', { profiles: updatedProfiles });
      setSettings(prev => ({ ...prev, profiles: updatedProfiles }));
      closeModal();
    } catch (error) {
      console.error("Failed to save profiles:", error);
      alert("Failed to save profiles. Please try again.");
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
        checked={selectedProfiles.includes(profile)}
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
      {profiles.length < 2 && renderEmptyBox(profiles.length)}

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
            <button onClick={saveChanges}>Save</button>
            <button onClick={closeModal}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Profiles;