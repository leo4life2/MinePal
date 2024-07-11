import React from 'react';
import PropTypes from 'prop-types';

function Profiles({ settings, newProfile, setNewProfile, addProfile, removeProfile, settingNotes }) {
  return (
    <div className="setting-item">
      <label htmlFor="profiles">
        Profiles:
        {settingNotes.profiles && <span className="setting-note"> ({settingNotes.profiles})</span>}
      </label>
      <div className="profiles-list">
        {settings.profiles.map((profile, index) => (
          <div key={index} className="profile-item">
            <span>{profile}</span>
            <button onClick={() => removeProfile(index)}>Remove</button>
          </div>
        ))}
      </div>
      <div className="add-profile">
        <input
          type="text"
          value={newProfile}
          onChange={(e) => setNewProfile(e.target.value)}
          placeholder="Enter new profile"
        />
        <button onClick={addProfile}>Add Profile</button>
      </div>
    </div>
  );
}

Profiles.propTypes = {
  settings: PropTypes.object.isRequired,
  newProfile: PropTypes.string.isRequired,
  setNewProfile: PropTypes.func.isRequired,
  addProfile: PropTypes.func.isRequired,
  removeProfile: PropTypes.func.isRequired,
  settingNotes: PropTypes.object
};

export default Profiles;