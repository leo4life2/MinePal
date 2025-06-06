import { useState, useEffect } from 'react';
import { useSupabase } from '../../../contexts/SupabaseContext/useSupabase';
import { useUserSettings } from '../../../contexts/UserSettingsContext/UserSettingsContext';
import { User as UserIcon, X as CloseIcon, Award, CreditCard, Database, Download, Upload } from 'react-feather';
import { PricingModal, ModalWrapper, AuthModal } from '..';
import TierBox from '../../TierBox/TierBox';
// @ts-expect-error - SVG import with React component syntax
import PalForgeIcon from '../../../assets/palforge.svg?react';
import './AccountModal.css';

type Tab = 'account' | 'subscription' | 'palforge' | 'backup';

interface PublishedPal {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

function AccountModal() {
  const { user, signOut, isPaying, clearAuthError, userPlan, getCustomerPortal, supabase } = useSupabase();
  const { refresh } = useUserSettings();
  const [showModal, setShowModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const [publishedPals, setPublishedPals] = useState<PublishedPal[]>([]);
  const [loadingPals, setLoadingPals] = useState(false);
  const [showUnpublishModal, setShowUnpublishModal] = useState(false);
  const [palToUnpublish, setPalToUnpublish] = useState<PublishedPal | null>(null);
  const [unpublishingPalId, setUnpublishingPalId] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<{ profilesRestored: number; botsRestored: number } | null>(null);

  // Fetch published pals when user changes or PalForge tab is active
  useEffect(() => {
    if (user && activeTab === 'palforge') {
      fetchPublishedPals();
    }
  }, [user, activeTab]);

  const fetchPublishedPals = async () => {
    if (!user) return;
    
    setLoadingPals(true);
    try {
      const { data, error } = await supabase
        .from('pals')
        .select('id, name, description, created_at')
        .eq('creator', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching published pals:', error);
        setError('Failed to load published pals');
        return;
      }

      setPublishedPals(data || []);
    } catch (err) {
      console.error('Failed to fetch published pals:', err);
      setError('Failed to load published pals');
    } finally {
      setLoadingPals(false);
    }
  };

  const handleUnpublishClick = (pal: PublishedPal) => {
    setPalToUnpublish(pal);
    setShowUnpublishModal(true);
  };

  const handleConfirmUnpublish = async () => {
    if (!palToUnpublish) return;

    setUnpublishingPalId(palToUnpublish.id);
    try {
      const { error } = await supabase
        .from('pals')
        .delete()
        .eq('id', palToUnpublish.id);

      if (error) {
        console.error('Error unpublishing pal:', error);
        setError('Failed to unpublish pal');
        return;
      }

      // Remove the pal from the local state
      setPublishedPals(prev => prev.filter(p => p.id !== palToUnpublish.id));
      setShowUnpublishModal(false);
      setPalToUnpublish(null);
    } catch (err) {
      console.error('Failed to unpublish pal:', err);
      setError('Failed to unpublish pal');
    } finally {
      setUnpublishingPalId(null);
    }
  };

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
    setIsLoading(true);
    setError(null);
    try {
      if (isPaying) {
        await getCustomerPortal('update');
        setShowModal(false);
      } else {
        // If user is not paying, show pricing modal
        setShowPricingModal(true);
        setShowModal(false);
      }
    } catch (err) {
      console.error('Error handling plan button click:', err);
      setError(err instanceof Error ? err.message : 'Failed to process request. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelPlan = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await getCustomerPortal('cancel');
      setShowModal(false);
    } catch (err) {
      console.error('Error cancelling plan via customer portal:', err);
      setError(err instanceof Error ? err.message : 'Failed to access customer portal. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:10101/backup');
      if (!response.ok) {
        throw new Error('Failed to create backup');
      }
      
      // Get the filename from the response headers
      const contentDisposition = response.headers.get('content-disposition');
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'minepal-backup.zip';
      
      // Create a blob from the response
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error creating backup:', err);
      setError(err instanceof Error ? err.message : 'Failed to create backup');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestoreLoading(true);
    setError(null);
    setRestoreSuccess(null);

    try {
      const formData = new FormData();
      formData.append('backup', file);

      const response = await fetch('http://localhost:10101/restore', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to restore backup');
      }

      const result = await response.json();
      setRestoreSuccess({
        profilesRestored: result.profilesRestored,
        botsRestored: result.botsRestored
      });
      
      // Refresh the settings to update the UI with the restored data
      await refresh();
    } catch (err) {
      console.error('Error restoring backup:', err);
      setError(err instanceof Error ? err.message : 'Failed to restore backup');
    } finally {
      setRestoreLoading(false);
      // Reset the file input
      event.target.value = '';
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
        <span className="account-name">My Account</span>
      </button>
      <TierBox tier={userPlan} />

      { showModal && (
        <ModalWrapper onClose={() => setShowModal(false)}>
          <div className="modal-content account-modal">
            <button 
              className="modal-close-icon"
              onClick={() => setShowModal(false)}
            >
              <CloseIcon size={18} />
            </button>
            
            <div className="account-modal-header">
              <div className="account-tabs">
                <button 
                  className={`account-tab ${activeTab === 'account' ? 'active' : ''}`}
                  onClick={() => setActiveTab('account')}
                >
                  <UserIcon size={16} />
                  <span>Account</span>
                </button>
                <button 
                  className={`account-tab ${activeTab === 'subscription' ? 'active' : ''}`}
                  onClick={() => setActiveTab('subscription')}
                >
                  <CreditCard size={16} />
                  <span>Subscription</span>
                </button>
                <button 
                  className={`account-tab ${activeTab === 'palforge' ? 'active' : ''}`}
                  onClick={() => setActiveTab('palforge')}
                >
                  <PalForgeIcon className="palforge-icon" />
                  <span>PalForge</span>
                </button>
                <button 
                  className={`account-tab ${activeTab === 'backup' ? 'active' : ''}`}
                  onClick={() => setActiveTab('backup')}
                >
                  <Database size={16} />
                  <span>Backup</span>
                </button>
              </div>
            </div>

            <div className="account-tab-content">
              {activeTab === 'account' && (
                <div className="account-tab-panel">
                  <div className="account-profile-section">
                    <img 
                      src={avatar_url} 
                      alt={full_name} 
                      className="account-avatar-large"
                    />
                    <h3 className="account-profile-name">{full_name}</h3>
                    <p className="account-user-id">{user.id}</p>
                  </div>

                  <div className="account-actions">
                    <button 
                      className="sign-out-button"
                      onClick={handleSignOut}
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'subscription' && (
                <div className="subscription-tab-panel">
                  <div className="subscription-container">
                    <div className="subscription-tier-section">
                      <h4 className="subscription-section-title">Current Plan</h4>
                      <TierBox tier={userPlan} />
                    </div>

                    <div className="subscription-actions">
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
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'palforge' && (
                <div className="palforge-tab-panel">
                  <div className="palforge-header">
                    <h4 className="palforge-title">Published Pals</h4>
                    <p className="palforge-subtitle">Manage your pals shared on PalForge</p>
                  </div>

                  {loadingPals ? (
                    <div className="palforge-loading">Loading published pals...</div>
                  ) : publishedPals.length === 0 ? (
                    <div className="palforge-empty">
                      <p>You haven&apos;t published any pals yet.</p>
                      <p className="palforge-empty-subtitle">Share your pals with the community to see them here!</p>
                    </div>
                  ) : (
                    <div className="palforge-list">
                      {publishedPals.map((pal) => (
                        <div key={pal.id} className="palforge-item">
                          <div className="palforge-item-info">
                            <div className="palforge-item-header">
                              <h5 className="palforge-item-name">{pal.name}</h5>
                              <span className="palforge-item-id">ID: {pal.id}</span>
                            </div>
                            <p className="palforge-item-description">{pal.description}</p>
                            <span className="palforge-item-date">Published {formatDate(pal.created_at)}</span>
                          </div>
                          <button
                            className="unpublish-button"
                            onClick={() => handleUnpublishClick(pal)}
                            disabled={unpublishingPalId === pal.id}
                          >
                            {unpublishingPalId === pal.id ? 'Unpublishing...' : 'Unpublish'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {error && <div className="error-message">{error}</div>}
                </div>
              )}

              {activeTab === 'backup' && (
                <div className="backup-tab-panel">
                  <div className="backup-header">
                    <h4 className="backup-title">Backup & Restore</h4>
                    {restoreSuccess && (
                      <p className="backup-restore-success">✓ Backup restore success</p>
                    )}
                  </div>

                  <div className="backup-section">
                    <div className="backup-item">
                      <div className="backup-item-info">
                        <h5 className="backup-item-title">Create Backup</h5>
                        <p className="backup-item-description">Download a zip file containing all your profiles and bot memories</p>
                      </div>
                      <button
                        className="backup-button"
                        onClick={handleBackup}
                        disabled={backupLoading}
                      >
                        <Download size={16} />
                        <span>{backupLoading ? 'Creating...' : 'Download Backup'}</span>
                      </button>
                    </div>

                    <div className="backup-item">
                      <div className="backup-item-info">
                        <h5 className="backup-item-title">Restore Backup</h5>
                        <p className="backup-item-description">Upload a backup zip file to restore your pal data (merges with existing data)</p>
                      </div>
                      <div className="restore-upload-container">
                        <input
                          type="file"
                          accept=".zip"
                          onChange={handleRestore}
                          disabled={restoreLoading}
                          className="restore-file-input"
                          id="restore-file-input"
                        />
                        <label htmlFor="restore-file-input" className="restore-button">
                          <Upload size={16} />
                          <span>{restoreLoading ? 'Restoring...' : 'Choose Backup File'}</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {error && <div className="error-message">{error}</div>}
                </div>
              )}
            </div>
          </div>
        </ModalWrapper>
      )}

      {showUnpublishModal && palToUnpublish && (
        <ModalWrapper onClose={() => setShowUnpublishModal(false)}>
          <div className="modal-content unpublish-modal">
            <h3>Unpublish Pal</h3>
            <p>Are you sure you want to unpublish <strong>{palToUnpublish.name}</strong>?</p>
            <p className="unpublish-warning">
              This will remove the pal from PalForge and delete all associated data. 
              Your local pal will not be affected.
            </p>
            <div className="unpublish-actions">
              <button 
                className="unpublish-cancel-button"
                onClick={() => setShowUnpublishModal(false)}
              >
                Cancel
              </button>
              <button 
                className="unpublish-confirm-button"
                onClick={handleConfirmUnpublish}
                disabled={unpublishingPalId === palToUnpublish.id}
              >
                {unpublishingPalId === palToUnpublish.id ? 'Unpublishing...' : 'Unpublish'}
              </button>
            </div>
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