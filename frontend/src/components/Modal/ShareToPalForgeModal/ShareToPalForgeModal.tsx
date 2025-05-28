import { useState } from 'react';
import { Profile } from '../../../types/apiTypes';
import { X as CloseIcon, Upload, ArrowRight } from 'react-feather';
import './ShareToPalForgeModal.css';
import { ModalWrapper } from '..';

interface ShareToPalForgeModalProps {
  profile: Profile;
  onClose: () => void;
}

function ShareToPalForgeModal({ profile, onClose }: ShareToPalForgeModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleImageSelect = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageSelect(file);
    }
  };

  const handleNext = () => {
    setCurrentStep(2);
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  const handleShare = async () => {
    setIsSharing(true);
    
    // Placeholder for actual share logic
    const shareData = {
      name: profile.name,
      personality: profile.personality,
      base_voice_id: profile.base_voice_id,
      image: selectedImage,
      description: description.trim()
    };
    
    console.log('Sharing to PalForge:', shareData);
    
    // Simulate network request
    setTimeout(() => {
      setIsSharing(false);
      onClose();
    }, 1500);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="modal-content share-to-palforge-modal">
        <button className="modal-close-icon" onClick={onClose}>
          <CloseIcon size={18} />
        </button>

        <div className="share-modal-header">
          <h2>Share to PalForge</h2>
        </div>

        {currentStep === 1 ? (
          <div className="share-modal-step">
            <div className="share-modal-section">
              <h3>Add an Image <span className="optional-tag">(Optional)</span></h3>
              <div 
                className={`image-upload-area ${isDragging ? 'dragging' : ''} ${imagePreview ? 'has-image' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !imagePreview && document.getElementById('image-input')?.click()}
              >
                {imagePreview ? (
                  <div className="image-preview-container">
                    <img src={imagePreview} alt="Pal preview" className="image-preview" />
                    <button className="remove-image-button" onClick={(e) => {
                      e.stopPropagation();
                      removeImage();
                    }}>
                      <CloseIcon size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <Upload size={32} />
                    <p>Click to select or drag and drop an image</p>
                    <span className="file-hint">PNG, JPG, GIF up to 10MB</span>
                  </div>
                )}
                <input
                  id="image-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            <div className="share-modal-section">
              <h3>Add a Description <span className="optional-tag">(Optional)</span></h3>
              <textarea
                className="description-textarea"
                placeholder="Write a short description to help others understand what makes your Pal special..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
              <div className="character-count">
                {description.length}/500
              </div>
            </div>

            <div className="modal-actions">
              <button className="next-button" onClick={handleNext}>
                {selectedImage || description.trim() ? 'Next' : 'Skip'}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="share-modal-step share-modal-step--review">
              <div className="review-section">
                <div className="review-item">
                  <label>Name</label>
                  <div className="review-content">{profile.name}</div>
                </div>

                <div className="review-item">
                  <label>Identity Prompt</label>
                  <div className="review-content review-content--multiline">
                    {profile.personality}
                  </div>
                </div>

                {profile.base_voice_id && (
                  <div className="review-item">
                    <label>Pal Voice</label>
                    <div className="review-content">{profile.base_voice_id}</div>
                  </div>
                )}

                {imagePreview && (
                  <div className="review-item">
                    <label>Image</label>
                    <img src={imagePreview} alt="Pal preview" className="review-image" />
                  </div>
                )}

                {description && (
                  <div className="review-item">
                    <label>Description</label>
                    <div className="review-content review-content--multiline">
                      {description}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-actions modal-actions--split">
              <button className="back-button" onClick={handleBack}>
                Back
              </button>
              <button 
                className="share-button" 
                onClick={handleShare}
                disabled={isSharing}
              >
                {isSharing ? (
                  'Sharing...'
                ) : (
                  'Share to PalForge'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalWrapper>
  );
}

export default ShareToPalForgeModal; 