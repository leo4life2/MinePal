import { useState } from 'react';
import { useSupabase } from '../../../contexts/SupabaseContext/useSupabase';
import { User as UserIcon, X as CloseIcon, Award } from 'react-feather';
import { PricingModal, ModalWrapper, AuthModal } from '..';
import './AccountModal.css';
import { HTTPS_BACKEND_URL } from '../../../constants';

// Get electron shell if we're in electron
const isElectron = window && window.process && window.process.type;
const electron = isElectron ? window.require('electron') : null;
const shell = electron?.shell;

function AccountModal() {
  const { user, signOut, isPaying, tierQuota, stripeData, refreshSubscription, clearAuthError } = useSupabase();
  const [showModal, setShowModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="account-container">
        <button 
          className="account-button account-button-placeholder"
          onClick={() => setShowAuthModal(true)}
        >
          <UserIcon size={18} className="account-icon" />
          <span className="account-name">Not signed in</span>
        </button>
        
        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => {
            setShowAuthModal(false);
            clearAuthError();
          }} 
        />
      </div>
    );
  }

  const { avatar_url, full_name } = user.user_metadata;

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowModal(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handlePlanButtonClick = async () => {
    if (isPaying) {
      await getCustomerPortal('update');
    } else {
      // If user is not paying, show pricing modal
      setShowPricingModal(true);
    }
    setShowModal(false);
  };

  const handleCancelPlan = async () => {
    await getCustomerPortal('cancel');
  };

  const getCustomerPortal = async (action?: 'cancel' | 'update') => {
    if (!stripeData.customerId) {
      setError('No customer ID found. Please contact support.');
      return;
    }

    if (action && !stripeData.subscriptionId) {
      setError('No subscription ID found. Please contact support.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Refresh subscription data first to ensure we have the latest info
      await refreshSubscription();

      // Call the backend API to get customer portal URL
      const response = await fetch(`${HTTPS_BACKEND_URL}/api/customer-portal/${stripeData.customerId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message || 
          `Failed to get customer portal URL (${response.status})`
        );
      }

      const { url } = await response.json();

      // Append the appropriate path if we're handling a subscription action
      let finalUrl = url;
      if (action && stripeData.subscriptionId) {
        finalUrl = `${url}/subscriptions/${stripeData.subscriptionId}/${action}`;
      }

      // Open the portal URL in external browser
      if (shell) {
        shell.openExternal(finalUrl);
      } else {
        console.log('Not in Electron environment, would open:', finalUrl);
      }

      setShowModal(false);
    } catch (err) {
      console.error('Error getting customer portal URL:', err);
      setError(err instanceof Error ? err.message : 'Failed to access customer portal. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="account-container">
      <button 
        className="account-button" 
        onClick={() => setShowModal(true)}
      >
        <img 
          src={avatar_url} 
          alt={full_name} 
          className="account-avatar"
        />
        <span className="account-name">{full_name}</span>
      </button>

      { showModal && (
        <ModalWrapper onClose={() => setShowModal(false)}>
          <div className="modal-content account-modal">
            <button 
              className="modal-close-icon"
              onClick={() => setShowModal(false)}
            >
              <CloseIcon size={18} />
            </button>
            
            <div className="account-info">
              <img 
                src={avatar_url} 
                alt={full_name} 
                className="account-avatar-large"
              />
              <h3>{full_name}</h3>
              <p className="account-user-id">Minepal User ID: {user.id}</p>
              {tierQuota !== null && (
                <p className="account-plan">
                  Your Plan: {tierQuota} responses/month
                </p>
              )}
            </div>

            <button 
              className="choose-plan-button"
              onClick={handlePlanButtonClick}
              disabled={isLoading}
            >
              <Award size={16} className="crown-icon" />
              <span className="button-text">
                {isLoading ? "Loading..." : isPaying ? "Change Plan" : "Purchase Plan"}
              </span>
            </button>
            
            {isPaying && (
              <div className="cancel-plan-container">
                <button 
                  className="cancel-plan-button"
                  onClick={handleCancelPlan}
                  disabled={isLoading}
                >
                  {isLoading ? "Loading..." : "Cancel Plan"}
                </button>
                <p className="cancel-plan-note">
                  If you cancel, you&apos;ll have access to your current quota until the end of the billing cycle, then you&apos;ll revert to the free tier.
                </p>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <div className="account-divider"></div>

            <button 
              className="sign-out-button"
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </div>
        </ModalWrapper>
      )}

      {showPricingModal && (
        <PricingModal 
          onClose={() => {
            setShowPricingModal(false);
          }} 
        />
      )}
    </div>
  );
}

export default AccountModal; 