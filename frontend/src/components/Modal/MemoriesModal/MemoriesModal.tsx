import React from 'react';
import './MemoriesModal.css';
import { Memory } from '../../../utils/api';
import { Trash2, X as CloseIcon } from 'react-feather';
import ModalWrapper from '../ModalWrapper';

interface MemoriesModalProps {
  profileName: string;
  memories: Memory[];
  memoryError?: string;
  onDeleteMemory: (memoryId: string) => void;
  onClose: () => void;
}

const MemoriesModal: React.FC<MemoriesModalProps> = ({
  profileName,
  memories,
  memoryError,
  onDeleteMemory,
  onClose,
}) => {
  return (
    <ModalWrapper onClose={onClose}>
      <div className="modal-content memories-modal">
        <button className="modal-close-icon" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        
        <h2 className="memories-modal-title">{profileName}'s Memories</h2>
        
        <div className="memories-container">
          {memories.length > 0 ? (
            <div className="memories-list">
              {memories.map((memory) => (
                <div key={memory.id} className="memory-item">
                  <div className="memory-content">
                    <p className="memory-text">{memory.text}</p>
                  </div>
                  <button
                    className="memory-delete-button"
                    onClick={() => onDeleteMemory(memory.id)}
                    title="Delete memory"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-memories">
              <p>No memories found for {profileName}</p>
            </div>
          )}
        </div>
        
        {memoryError && (
          <div className="memories-error">
            <p>{memoryError}</p>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
};

export default MemoriesModal; 