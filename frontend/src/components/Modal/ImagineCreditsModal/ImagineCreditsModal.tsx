import { useState } from 'react';
import { IMAGINE_CREDIT_PACKAGES, CreditPackage, HTTPS_BACKEND_URL } from '../../../constants';
import { X as CloseIcon, LifeBuoy } from 'react-feather';
import { useSupabase } from '../../../contexts/SupabaseContext/useSupabase';
import './ImagineCreditsModal.css';
import { ModalWrapper } from '..';

// Get electron shell
const isElectron = window && window.process && window.process.type;
const electron = isElectron ? window.require('electron') : null;
const shell = electron?.shell;

interface ImagineCreditsModalProps {
  onClose: () => void;
}

function ImagineCreditsModal({ onClose }: ImagineCreditsModalProps) {
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useSupabase();
  
  // Calculate price per credit
  const calculatePricePerCredit = (pack: CreditPackage) => {
    const pricePerCredit = pack.price / pack.credits;
    return pricePerCredit.toFixed(3);
  };

  // Calculate savings percentage compared to baseline (most expensive per credit)
  const calculateSavings = (pack: CreditPackage) => {
    const baselinePricePerCredit = Math.max(...IMAGINE_CREDIT_PACKAGES.map(p => p.price / p.credits));
    const currentPricePerCredit = pack.price / pack.credits;
    const savingsPercentage = ((baselinePricePerCredit - currentPricePerCredit) / baselinePricePerCredit) * 100;
    return savingsPercentage > 0 ? Math.round(savingsPercentage) : 0;
  };

  const handlePackageSelect = (pack: CreditPackage) => {
    setSelectedPackage(pack);
  };

  const handlePurchase = async () => {
    if (!selectedPackage) return;
    if (!user) {
      setError('You must be signed in to purchase credits. Please sign in and try again.');
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
          priceId: selectedPackage.priceId,
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
      console.error('Error processing purchase:', error);
      setError(error instanceof Error ? error.message : 'Failed to process purchase. Please try again later.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getButtonText = () => {
    if (isProcessing) return 'Processing...';
    if (!selectedPackage) return 'Select a Package';
    return `Purchase ${selectedPackage.credits} Credits`;
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="modal-content imagine-credits-modal">
        <button className="modal-close-icon" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        <h2 className="credits-title">Purchase Imagine Credits</h2>
        <p className="credits-subtitle">Choose the credit package that works best for you</p>
        
        <div className="credit-packages">
          {IMAGINE_CREDIT_PACKAGES.map((pack) => {
            const pricePerCredit = calculatePricePerCredit(pack);
            const savings = calculateSavings(pack);
            
            return (
              <div 
                key={pack.id} 
                className={`credit-package ${selectedPackage?.id === pack.id ? 'selected' : ''}`}
                onClick={() => handlePackageSelect(pack)}
              >
                <div className="package-details">
                  <h3 className="package-name">{pack.name}</h3>
                  <div className="package-credits">
                    <LifeBuoy width={16} height={16} strokeWidth={3} style={{ transform: 'translateY(-0.8px)' }} />
                    <span className="credits-amount">{pack.credits} credits</span>
                  </div>
                  <div className="package-value">
                    <span className="price-per-credit">${pricePerCredit}</span> per credit
                    {savings > 0 && (
                      <span className="savings-badge">{savings}% off</span>
                    )}
                  </div>
                </div>
                <div className="package-price-container">
                  <div className="package-price">
                    <span className="price-currency">$</span>
                    <span className="price-amount">{pack.price}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="credits-info">
          <ul>
            <li>Credits never expire</li>
            <li>Instantly available upon purchase</li>
          </ul>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <div className="credits-actions">
          <button 
            className="purchase-button"
            disabled={!selectedPackage || isProcessing}
            onClick={handlePurchase}
          >
            {getButtonText()}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

export default ImagineCreditsModal; 