import { Plus, Globe } from 'react-feather';
import { X as CloseIcon } from 'react-feather';
import './CreatePalOptionsModal.css';
import { ModalWrapper } from '..';

// Get electron shell
const isElectron = window && window.process && window.process.type;
const electron = isElectron ? window.require('electron') : null;
const shell = electron?.shell;

interface CreatePalOptionsModalProps {
  onCreateFromScratch: () => void;
  onClose: () => void;
}

function CreatePalOptionsModal({ onCreateFromScratch, onClose }: CreatePalOptionsModalProps) {
  const handleCreateFromScratch = () => {
    onCreateFromScratch();
    onClose();
  };

  const handleBrowsePalForge = () => {
    if (shell) {
      shell.openExternal('https://minepal.net/palforge');
    } else {
      window.open('https://minepal.net/palforge', '_blank', 'noopener,noreferrer');
    }
    onClose();
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="modal-content create-pal-options-modal">
        <button className="modal-close-icon" onClick={onClose}>
          <CloseIcon size={18} />
        </button>

        <div className="create-pal-header">
          <h2>Create a New Pal</h2>
          <p className="create-pal-subtitle">
            Choose how you'd like to get started
          </p>
        </div>

        <div className="create-pal-options">
          <button className="create-option create-from-scratch" onClick={handleCreateFromScratch}>
            <div className="option-icon">
              <Plus size={32} />
            </div>
            <div className="option-content">
              <h3>Create from Scratch</h3>
              <p>Build your own custom Pal with a unique personality</p>
            </div>
          </button>

          <button className="create-option browse-palforge" onClick={handleBrowsePalForge}>
            <div className="option-icon">
              <Globe size={32} />
            </div>
            <div className="option-content">
              <h3>Browse PalForge</h3>
              <p>Discover and import Pals shared by the community</p>
            </div>
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

export default CreatePalOptionsModal; 