import React, { useState } from 'react';
import './TierBox.css';
import { TierType } from '../../constants';
import PricingModal from '../Modal/PricingModal/PricingModal';

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
  const [showPricingModal, setShowPricingModal] = useState(false);
  const backgroundColor = tierColors[tier];

  const handleClick = () => {
    if (tier === 'FREE') {
      setShowPricingModal(true);
    }
    // Do nothing if not FREE tier
  };

  const handleClosePricingModal = () => {
    setShowPricingModal(false);
  };

  const isClickable = tier === 'FREE';

  return (
    <>
      <div 
        className={`tier-box ${isClickable ? 'tier-box--clickable' : ''}`}
        style={{ backgroundColor }}
        onClick={handleClick}
      >
        <span className="tier-box-text">{tier}</span>
      </div>
      {showPricingModal && (
        <PricingModal onClose={handleClosePricingModal} />
      )}
    </>
  );
};

export default TierBox; 