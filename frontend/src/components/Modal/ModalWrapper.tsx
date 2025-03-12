import React from 'react';

interface ModalWrapperProps {
  onClose: () => void;
  children: React.ReactNode;
}

const ModalWrapper: React.FC<ModalWrapperProps> = ({ onClose, children }) => {
  // Handle background click to close modal
  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if the click was directly on the background element with className="modal"
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal" onClick={handleBackgroundClick}>
      {children}
    </div>
  );
};

export default ModalWrapper; 