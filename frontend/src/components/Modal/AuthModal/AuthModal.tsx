import { useState } from 'react';
import { useSupabase } from '../../../contexts/SupabaseContext/useSupabase';
import DiscordIcon from '../../../assets/discord.svg';
import { ModalWrapper } from '..';
import './AuthModal.css';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signInWithDiscord, authError, clearAuthError } = useSupabase();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  // Combined error display - from local error state or context auth error
  const displayError = error || authError;

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
    onClose();
    setError(undefined);
    clearAuthError();
  };

  if (!isOpen) return null;

  return (
    <ModalWrapper onClose={closeAuthModal}>
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
          <a href="https://app.getterms.io/view/4ZA3K/acceptable-use/en-us" target="_blank" rel="noopener noreferrer">Acceptable Use Policy</a>
        </p>
        {displayError && <div className="error-message">{displayError}</div>}
        
        <button className="auth-cancel-button" onClick={closeAuthModal}>
          Go back
        </button>
      </div>
    </ModalWrapper>
  );
}

export default AuthModal; 