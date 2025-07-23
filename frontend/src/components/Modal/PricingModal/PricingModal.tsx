import { useState, useEffect } from 'react';
import { PRICING_PLANS, PricingPlan, HTTPS_BACKEND_URL } from '../../../constants';
import { X as CloseIcon, Mic, Star, ExternalLink } from 'react-feather';
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
            return (
              <div 
                key={plan.id} 
                className={`pricing-plan ${selectedPlan?.id === plan.id ? 'selected' : ''}`}
                onClick={() => handlePlanSelect(plan)}
              >
                <div className="plan-details">
                  <h3 className="plan-name">Monthly {plan.name}</h3>
                  <div className="plan-quota">
                    {plan.quota} chat credits
                    <span className="expiration-note">(expires monthly)</span>
                  </div>
                  {plan.imagineCredits && (
                    <div className="imagine-credits-feature">
                      <Star size={14} />
                      {plan.imagineCredits} Imagine credit{plan.imagineCredits > 1 ? 's' : ''}
                      <span className="expiration-note">(won&apos;t expire)</span>
                    </div>
                  )}
                  {plan.features && plan.features.includes('Pal Voice') && (
                    <a 
                      href="https://minepal.net/pal-voice" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="pal-voice-feature"
                      onClick={(e) => {
                        // Use Electron shell to open external links if available
                        if (shell) {
                          e.preventDefault();
                          shell.openExternal('https://minepal.net/pal-voice');
                        }
                      }}
                    >
                      <Mic size={14} />
                      Includes Pal Voice
                      <ExternalLink size={12} />
                    </a>
                  )}
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
            <li>Chat credits immediately refreshed upon subscription</li>
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