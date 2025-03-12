import { useState, useEffect } from 'react';
import { PRICING_PLANS, PricingPlan, HTTPS_BACKEND_URL } from '../../../constants';
import { X as CloseIcon } from 'react-feather';
import { useSupabase } from '../../../contexts/SupabaseContext/useSupabase';
import './PricingModal.css';
import { ModalWrapper } from '..';

// Get electron shell
const isElectron = window && window.process && window.process.type;
const electron = isElectron ? window.require('electron') : null;
const shell = electron?.shell;

interface PricingModalProps {
  onClose: () => void;
}

function PricingModal({ onClose }: PricingModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useSupabase();
  
  // Calculate price per response for each plan
  const calculatePricePerResponse = (plan: PricingPlan) => {
    const pricePerResponse = plan.price / plan.quota;
    return pricePerResponse.toFixed(4);
  };

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobileView(window.innerWidth <= 480);
    };
    
    // Check on initial render
    checkScreenSize();
    
    // Add event listener for window resize
    window.addEventListener('resize', checkScreenSize);
    
    // Clean up event listener
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const handlePlanSelect = (plan: PricingPlan) => {
    setSelectedPlan(plan);
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) return;
    if (!user) {
      setError('You must be signed in to subscribe. Please sign in and try again.');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const response = await fetch(`${HTTPS_BACKEND_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: selectedPlan.priceId,
          userId: user.id
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message || 
          `Failed to create checkout session (${response.status})`
        );
      }
      
      const { url } = await response.json();
      
      // Open the checkout URL in external browser if in Electron
      if (shell) {
        shell.openExternal(url);
      } else {
        console.log('Not in Electron environment, would open:', url);
        // In browser dev environment
      }
      
      // Close modal after opening checkout
      onClose();
    } catch (error) {
      console.error('Error processing subscription:', error);
      setError(error instanceof Error ? error.message : 'Failed to process subscription. Please try again later.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getButtonText = () => {
    if (isProcessing) return 'Processing...';
    if (!selectedPlan) return 'Select a Plan';
    if (isMobileView) return `Subscribe to ${selectedPlan.name}`;
    return `Subscribe to ${selectedPlan.name}`;
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="modal-content pricing-modal">
        <button className="modal-close-icon" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        <h2 className="pricing-title">Purchase a Plan</h2>
        <p className="pricing-subtitle">Choose the plan that works best for you</p>
        
        <div className="pricing-plans">
          {PRICING_PLANS.map((plan) => {
            const pricePerResponse = calculatePricePerResponse(plan);
            return (
              <div 
                key={plan.id} 
                className={`pricing-plan ${selectedPlan?.id === plan.id ? 'selected' : ''}`}
                onClick={() => handlePlanSelect(plan)}
              >
                <div className="plan-details">
                  <h3 className="plan-name">{plan.name}</h3>
                  <div className="plan-quota">{plan.quota} responses/mo</div>
                  <div className="plan-value">
                    <span className="price-per-response">${pricePerResponse}</span> per response
                  </div>
                </div>
                <div className="plan-price-container">
                  <div className="plan-price">
                    <span className="price-currency">$</span>
                    <span className="price-amount">{plan.price}</span>
                  </div>
                  <span className="price-period">/month</span>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="subscription-info">
          <ul>
            <li>Quota refreshes monthly</li>
            <li>Upgrade, downgrade, or cancel anytime</li>
            <li>Responses immediately refreshed upon subscription</li>
          </ul>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <div className="pricing-actions">
          <button 
            className="subscribe-button"
            disabled={!selectedPlan || isProcessing}
            onClick={handleSubscribe}
          >
            {getButtonText()}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

export default PricingModal; 