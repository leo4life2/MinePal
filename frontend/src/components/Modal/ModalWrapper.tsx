import React, { useRef } from 'react';

interface ModalWrapperProps {
  onClose: () => void;
  children: React.ReactNode;
}

const ModalWrapper: React.FC<ModalWrapperProps> = ({ onClose, children }) => {
  const mouseDownOutside = useRef(false);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Track if mousedown happened outside the modal content
    mouseDownOutside.current = e.target === e.currentTarget;
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if both mousedown AND mouseup happened outside
    if (mouseDownOutside.current && e.target === e.currentTarget) {
      onClose();
    }
    // Reset for next interaction
    mouseDownOutside.current = false;
  };

  return (
    <div 
      className="modal modal-wrapper-centered" 
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {children}
    </div>
  );
};

export default ModalWrapper; 