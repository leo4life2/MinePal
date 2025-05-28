import React from 'react';
import './MemoriesModal.css';
import { Memory } from '../../../utils/api';
import { Trash2 } from 'react-feather';

interface MemoriesModalProps {
  profileName: string;
  memories: Memory[];
  memoryError?: string;
  onDeleteMemory: (memoryId: string) => void;
}

const MemoriesModal: React.FC<MemoriesModalProps> = ({
  profileName,
  memories,
  memoryError,
  onDeleteMemory,
}) => {
  return (
    <div className="memories-modal">
      <h3>{profileName}'s Memories</h3>
      <div className="memories-table">
        {memories.length > 0 ? (
          memories.map((memory) => (
            <div key={memory.id} className="memory-row">
              <div className="memory-text">{memory.text}</div>
              <button
                className="delete-memory-button"
                onClick={() => onDeleteMemory(memory.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        ) : (
          <div className="no-memories">No memories found</div>
        )}
      </div>
      {memoryError && <div className="error-message">{memoryError}</div>}
    </div>
  );
};

export default MemoriesModal; 