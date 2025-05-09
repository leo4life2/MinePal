import React from 'react';
import './TierBox.css';
import { TierType } from '../../constants';

interface TierBoxProps {
  tier: TierType;
}

const tierColors: Record<TierType, string> = {
  FREE: '#546e7a',
  BASIC: '#9b59b6',
  STANDARD: '#E74B3C',
  PRO: '#F1C40F',
};

const TierBox: React.FC<TierBoxProps> = ({ tier }) => {
  const backgroundColor = tierColors[tier];

  return (
    <div className="tier-box" style={{ backgroundColor }}>
      <span className="tier-box-text">{tier}</span>
    </div>
  );
};

export default TierBox; 