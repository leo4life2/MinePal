import React from 'react';
import '../styles/GuidesLink.css';

const GuidesLink: React.FC = () => {
  return (
    <div className="guides-text">
      questions? see guides at <a href="https://minepal.net/guides" target="_blank" rel="noopener noreferrer" className="guides-link">guides / faq</a>
    </div>
  );
};

export default GuidesLink; 