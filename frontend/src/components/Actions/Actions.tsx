import { useState, useEffect } from "react";
import "./Actions.css";
import { useAgent } from "../../contexts/AgentContext/AgentContext";
import { useSupabase } from "../../contexts/SupabaseContext/useSupabase";
import DiscordIcon from '../../assets/discord.svg';
import RefreshIcon from '../../assets/refresh.svg';
import { PricingModal } from "../Modal";
import { HTTPS_BACKEND_URL } from "../../constants";

// Get electron shell
const isElectron = window && window.process && window.process.type;
const electron = isElectron ? window.require('electron') : null;
const shell = electron?.shell;

function Actions() {
  const { agentActive, start, stop } = useAgent();
  const { 
    signInWithDiscord, 
    user, 
    loading, 
    isPaying, 
    tierQuota,
    requestsRemaining,
    stripeData,
    refreshSubscription,
    authError,
    clearAuthError
  } = useSupabase();
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);

  // Combined error display - from local error state or context auth error
  const displayError = error || authError;

  const handleRefreshSubscription = async () => {
    setLoadingSubscription(true);
    try {
      await refreshSubscription();
    } catch (err) {
      console.error('Failed to refresh subscription data:', err);
    } finally {
      setLoadingSubscription(false);
    }
  };

  const getCustomerPortal = async () => {
    if (!stripeData.customerId) {
      setError('No customer ID found. Please contact support.');
      return;
    }

    setLoadingPortal(true);
    setError(undefined);

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

      let finalUrl = url;
      if (stripeData.subscriptionId) {
        finalUrl = `${url}/subscriptions/${stripeData.subscriptionId}/update`;
      }

      // Open the portal URL in external browser
      if (shell) {
        shell.openExternal(finalUrl);
      } else {
        console.log('Not in Electron environment, would open:', url);
      }
    } catch (err) {
      console.error('Error getting customer portal URL:', err);
      setError(err instanceof Error ? err.message : 'Failed to access customer portal. Please try again later.');
    } finally {
      setLoadingPortal(false);
    }
  };

  useEffect(() => {
    if (user && !loading) {
      setShowAuthModal(false);
      setIsLoading(false);
      setError(undefined);
      clearAuthError();
    }
  }, [user, loading, clearAuthError]);

  const handleDiscordSignIn = async () => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        await signInWithDiscord();
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.includes('0x800401F5')) {
            setError('No default browser, open this in your browser manually: https://wwcgmpbfypiagjfeixmn.supabase.co/auth/v1/authorize?provider=discord');
          } else {
            setError(`Sign in with Discord failed: ${err.message}`);
          }
        } else {
          setError('Failed to initiate Discord sign in');
        }
        setIsLoading(false);
      }
    }
  };

  const closeAuthModal = () => {
    setShowAuthModal(false);
    setError(undefined);
    clearAuthError();
  };

  const closePricingModal = () => {
    setShowPricingModal(false);
    clearAuthError();
  };

  const actionButtonPressed = () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    
    if (requestsRemaining === 0) {
      if (isPaying) {
        // If user is already paying, open customer portal to manage subscription
        getCustomerPortal();
      } else {
        // If user is not paying, show pricing modal
        setShowPricingModal(true);
      }
      return;
    }
    
    if (!agentActive) {
      start();
    } else {
      stop();
    }
  };

  const getButtonText = () => {
    if (!user) return "Sign In";
    if (loadingPortal) return "Loading...";
    if (requestsRemaining === 0) {
      return isPaying ? "Upgrade Plan" : "Purchase Plan";
    }
    return agentActive ? "Stop Bot" : "Start Bot";
  };

  return (
    <div className="actions">
      <button 
        className="action-button" 
        onClick={actionButtonPressed}
        disabled={loadingPortal}
      >
        {getButtonText()}
      </button>

      {displayError && <div className="error-message">{displayError}</div>}

      {user && (
        <div className="subscription-quota">
          <div className="progress-container">
            <div 
              className="progress-bar" 
              style={{ 
                width: requestsRemaining !== null && tierQuota !== null ? 
                  `${((tierQuota - requestsRemaining) / tierQuota) * 100}%` : 
                  '0%'
              }}
            ></div>
            <div className="quota-text">
              {loadingSubscription ? 
                'Loading...' : 
                (requestsRemaining !== null && tierQuota !== null) ? 
                  `${tierQuota - requestsRemaining}/${tierQuota} responses used this month` : 
                  '0/200 responses used this month'
              }
            </div>
            <button 
              className="refresh-button" 
              onClick={handleRefreshSubscription} 
              disabled={loadingSubscription}
            >
              <img 
                src={RefreshIcon} 
                alt="Refresh" 
                className={loadingSubscription ? "refresh-icon spinning" : "refresh-icon"} 
              />
            </button>
          </div>
          <div className="quota-refresh-notice">
            responses refresh at the beginning of each month
          </div>
        </div>
      )}

      {showAuthModal && (
        <div className="modal">
          <div className="modal-content auth-modal">
            <h2 className="auth-title">Welcome to MinePal</h2>
            <p className="auth-intro">Sign in with Discord to continue</p>
            
            <div className="auth-methods">
              <button 
                onClick={handleDiscordSignIn}
                className="auth-discord-button"
                disabled={isLoading}
              >
                <img src={DiscordIcon} alt="" width={20} height={20} className="discord-icon" />
                {isLoading ? "Connecting..." : "Continue with Discord"}
              </button>
            </div>
            <p className="terms-text">
                By continuing with Discord, you agree to our{' '}
                <a href="https://app.getterms.io/view/4ZA3K/tos/en-us" target="_blank" rel="noopener noreferrer">Terms of Service</a>,{' '}
                <a href="https://app.getterms.io/view/4ZA3K/privacy/en-us" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, and{' '}
                <a href="https://app.getterms.io/view/4ZA3K/aup/en-us" target="_blank" rel="noopener noreferrer">Acceptable Use Policy</a>
              </p>
            {displayError && <div className="error-message">{displayError}</div>}
            
            <button className="auth-cancel-button" onClick={closeAuthModal}>
              Go back
            </button>
          </div>
        </div>
      )}

      {showPricingModal && (
        <PricingModal onClose={closePricingModal} />
      )}
    </div>
  );
}

export default Actions;
