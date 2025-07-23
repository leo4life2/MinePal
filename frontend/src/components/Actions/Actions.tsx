import { useState, useEffect } from "react";
import "./Actions.css";
import { useAgent } from "../../contexts/AgentContext/AgentContext";
import { useSupabase } from "../../contexts/SupabaseContext/useSupabase";
import RefreshIcon from '../../assets/refresh.svg';
import { PricingModal, AuthModal } from "../Modal";
import { HTTPS_BACKEND_URL } from "../../constants";
import useWebSockets from "../../hooks/useWebSockets";
// import AudioActions from "./AudioActions";

// Get electron shell
const isElectron = window && window.process && window.process.type;
const electron = isElectron ? window.require('electron') : null;
const shell = electron?.shell;

function Actions() {
  const { agentActive, start, stop } = useAgent();
  const { connect, disconnect } = useWebSockets();
  const { 
    user, 
    loading, 
    isPaying, 
    tierQuota,
    requestsRemaining,
    stripeData,
    refreshSubscription,
    clearAuthError
  } = useSupabase();
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [error, setError] = useState<string>();
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);

  // Combined error display - from local error state or context auth error
  const displayError = error;

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
        shell.openExternal(finalUrl).catch((e: unknown) => console.log(JSON.stringify(e, null, 2)));
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
      setError(undefined);
      clearAuthError();
    }
  }, [user, loading, clearAuthError]);

  const closeAuthModal = () => {
    setShowAuthModal(false);
    setError(undefined);
    clearAuthError();
  };

  const closePricingModal = () => {
    setShowPricingModal(false);
    clearAuthError();
  };

  const actionButtonPressed = async () => {
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
      try {
        await start();
        // Try to connect WebSocket but don't fail if it doesn't work
        try {
          connect();
        } catch (wsError) {
          console.error('Failed to connect WebSocket:', wsError);
          // Don't set error state for WebSocket failures
        }
      } catch (err) {
        console.error('Failed to start bot:', err);
        let errorMessage = 'An unknown error occurred while trying to start the Pal.';
        
        // Type guard for Axios-like error structure
        if (typeof err === 'object' && err !== null && 'response' in err) {
          const responseError = err as { response?: { data?: { error?: string } } }; // Type assertion
          if (responseError.response && responseError.response.data && typeof responseError.response.data.error === 'string') {
            errorMessage = responseError.response.data.error;
          } else if (err instanceof Error) { // Fallback if response.data.error is not there but it's an Error instance
            errorMessage = err.message;
          }
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }
        setError(errorMessage);
      }
    } else {
      try {
        stop();
        // Try to disconnect WebSocket but don't fail if it doesn't work
        try {
          disconnect();
        } catch (wsError) {
          console.error('Failed to disconnect WebSocket:', wsError);
          // Don't set error state for WebSocket failures
        }
      } catch (error) {
        console.error('Failed to stop bot:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  };

  const getButtonText = () => {
    if (!user) return "Sign In";
    if (loadingPortal) return "Loading...";
    if (requestsRemaining === 0) {
      return isPaying ? "Upgrade Plan" : "Purchase Plan";
    }
    return agentActive ? "Stop Pal" : "Start Pal";
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
                  `${tierQuota - requestsRemaining}/${tierQuota} chat credits used this month` : 
                  '0/200 chat credits used this month'
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
            chat credits refresh at the beginning of each month
          </div>
        </div>
      )}

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={closeAuthModal} 
      />

      {showPricingModal && (
        <PricingModal onClose={closePricingModal} />
      )}
    </div>
  );
}

export default Actions;
