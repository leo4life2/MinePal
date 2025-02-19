import { useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext/useSupabase';
import { User as UserIcon } from 'react-feather';
import './Account.css';

function Account() {
  const { user, signOut } = useSupabase();
  const [showModal, setShowModal] = useState(false);

  if (!user) {
    return (
      <div className="account-container">
        <button className="account-button account-button-placeholder">
          <UserIcon size={18} className="account-icon" />
          <span className="account-name">Not signed in</span>
        </button>
      </div>
    );
  }

  const { avatar_url, full_name } = user.user_metadata;

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowModal(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="account-container">
      <button 
        className="account-button" 
        onClick={() => setShowModal(true)}
      >
        <img 
          src={avatar_url} 
          alt={full_name} 
          className="account-avatar"
        />
        <span className="account-name">{full_name}</span>
      </button>

      {showModal && (
        <div className="modal">
          <div className="modal-content account-modal">
            <div className="account-info">
              <img 
                src={avatar_url} 
                alt={full_name} 
                className="account-avatar-large"
              />
              <h3>{full_name}</h3>
            </div>
            <button 
              className="sign-out-button"
              onClick={handleSignOut}
            >
              Sign Out
            </button>
            <button 
              className="modal-close-button"
              onClick={() => setShowModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Account; 