import { useState, useEffect } from "react";
import "./Actions.css";
import { useAgent } from "../../contexts/AgentContext/AgentContext";
import { useSupabase } from "../../contexts/SupabaseContext/useSupabase";
import DiscordIcon from '../../assets/discord.svg';

function Actions() {
  const { agentActive, start, stop } = useAgent();
  const { signInWithDiscord, user, loading } = useSupabase();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user && !loading) {
      setShowAuthModal(false);
      setIsLoading(false);
      setError(undefined);
    }
  }, [user, loading]);

  const handleDiscordSignIn = async () => {
    setError(undefined);
    setIsLoading(true);
    try {
      await signInWithDiscord();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate Discord sign in');
      setIsLoading(false);
    }
  };

  const toggleAgent = () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!agentActive) {
      start();
    } else {
      stop();
    }
  };

  return (
    <div className="actions">
      <div className="notice" style={{ color: '#666666', fontSize: '0.9em', marginTop: '5px' }}>
        Voice chat temporarily disabled due to high server loads (will be back soon!)
      </div>
      <button className="action-button" onClick={toggleAgent}>
        {user ? (agentActive ? "Stop Bot" : "Start Bot") : "Sign In"}
      </button>

      {showAuthModal && (
        <div className="modal">
          <div className="modal-content auth-modal">
            <h2 className="auth-title">Welcome to MinePal</h2>
            <p className="auth-intro">Sign in with Discord to get free play time everyday!</p>
            
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

            {error && <div className="error-message">{error}</div>}
            
            <button className="auth-cancel-button" onClick={() => setShowAuthModal(false)}>
              Go back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Actions;
