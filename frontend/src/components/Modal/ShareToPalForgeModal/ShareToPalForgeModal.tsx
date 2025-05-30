import { useState, useCallback } from 'react';
import { Profile } from '../../../types/apiTypes';
import { X as CloseIcon, Upload, ArrowRight, Check } from 'react-feather';
import Cropper from 'react-easy-crop';
import './ShareToPalForgeModal.css';
import { ModalWrapper } from '..';
import { useSupabase } from '../../../contexts/SupabaseContext/useSupabase';
import { HTTPS_BACKEND_URL } from '../../../constants';

interface ShareToPalForgeModalProps {
  profile: Profile;
  onClose: () => void;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

function ShareToPalForgeModal({ profile, onClose }: ShareToPalForgeModalProps) {
  const { supabase } = useSupabase();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [thumbnailImage, setThumbnailImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string>();
  const [sharedPalId, setSharedPalId] = useState<number | null>(null);
  
  // Cropper states
  const [showCropper, setShowCropper] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', error => reject(error));
      image.src = url;
    });

  const getCroppedImg = useCallback(async (imageSrc: string, pixelCrop: CropArea): Promise<{ originalFile: File; thumbnailFile: File }> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Calculate original output dimensions
    const maxWidth = 1200;
    const maxHeight = 675;
    let originalWidth = pixelCrop.width;
    let originalHeight = pixelCrop.height;
    
    // If the cropped area is larger than max dimensions, scale it down
    if (originalWidth > maxWidth || originalHeight > maxHeight) {
      const widthRatio = maxWidth / originalWidth;
      const heightRatio = maxHeight / originalHeight;
      const ratio = Math.min(widthRatio, heightRatio);
      
      originalWidth = Math.round(originalWidth * ratio);
      originalHeight = Math.round(originalHeight * ratio);
    }

    // Create original image
    canvas.width = originalWidth;
    canvas.height = originalHeight;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      originalWidth,
      originalHeight
    );

    const originalFile = await new Promise<File>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'pal-image-original.jpg', { type: 'image/jpeg' });
          resolve(file);
        }
      }, 'image/jpeg', 0.9);
    });

    // Create thumbnail (400x225)
    const thumbnailWidth = 400;
    const thumbnailHeight = 225;
    
    canvas.width = thumbnailWidth;
    canvas.height = thumbnailHeight;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      thumbnailWidth,
      thumbnailHeight
    );

    const thumbnailFile = await new Promise<File>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'pal-image-thumbnail.jpg', { type: 'image/jpeg' });
          resolve(file);
        }
      }, 'image/jpeg', 0.9);
    });

    return { originalFile, thumbnailFile };
  }, []);

  const handleImageSelect = (file: File) => {
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
      if (file.size > 15 * 1024 * 1024) {
        alert('File size must be under 15MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setCropImage(reader.result as string);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    } else {
      alert('Please select a JPG or PNG file');
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

  const onCropComplete = useCallback((_: any, croppedAreaPixels: CropArea) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropDone = useCallback(async () => {
    if (cropImage && croppedAreaPixels) {
      try {
        const { originalFile, thumbnailFile } = await getCroppedImg(cropImage, croppedAreaPixels);
        setSelectedImage(originalFile);
        setThumbnailImage(thumbnailFile);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(originalFile);
        
        setShowCropper(false);
        setCropImage(null);
      } catch (error) {
        console.error('Error cropping image:', error);
      }
    }
  }, [cropImage, croppedAreaPixels, getCroppedImg]);

  const handleCropCancel = () => {
    setShowCropper(false);
    setCropImage(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleNext = () => {
    setCurrentStep(2);
    setError(undefined);
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  const handleShare = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      console.error('No access token available');
      setError('You must be signed in to share to PalForge.');
      return;
    }

    setIsSharing(true);
    setError(undefined); // Clear any previous errors
    
    try {
      // Step 1: Create the pal
      const createPalResponse = await fetch(`${HTTPS_BACKEND_URL}/palforge/create-pal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: profile.name,
          identity_prompt: profile.personality,
          description: description.trim() || undefined,
          has_image: !!selectedImage,
          base_voice: profile.base_voice_id || 'ballad',
        }),
      });

      if (!createPalResponse.ok) {
        const errorData = await createPalResponse.json().catch(() => null);
        throw new Error(
          errorData?.error || 
          `Failed to create pal (${createPalResponse.status})`
        );
      }

      const createPalResult = await createPalResponse.json();
      console.log('Pal created successfully:', createPalResult);

      // Store the pal ID for the success page
      setSharedPalId(createPalResult.pal.id);

      // If no image, we're done - go to success page
      if (!selectedImage || !thumbnailImage || !createPalResult.imageUploadInfo) {
        setIsSharing(false);
        setCurrentStep(3);
        return;
      }

      // Step 2: Upload both images to S3
      const { originalUpload, thumbnailUpload } = createPalResult.imageUploadInfo;
      
      // Upload original image
      const originalUploadResponse = await fetch(originalUpload.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/jpeg',
        },
        body: selectedImage,
      });

      if (!originalUploadResponse.ok) {
        throw new Error(`Failed to upload original image to S3 (${originalUploadResponse.status})`);
      }

      // Upload thumbnail image
      const thumbnailUploadResponse = await fetch(thumbnailUpload.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/jpeg',
        },
        body: thumbnailImage,
      });

      if (!thumbnailUploadResponse.ok) {
        throw new Error(`Failed to upload thumbnail image to S3 (${thumbnailUploadResponse.status})`);
      }

      // Step 3: Update the pal with the image keys
      const updatePalResponse = await fetch(`${HTTPS_BACKEND_URL}/palforge/update-pal/${createPalResult.pal.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          image_url: originalUpload.key,
          thumbnail_url: thumbnailUpload.key,
        }),
      });

      if (!updatePalResponse.ok) {
        const errorData = await updatePalResponse.json().catch(() => null);
        throw new Error(
          errorData?.error || 
          `Failed to update pal with image keys (${updatePalResponse.status})`
        );
      }

      const updatePalResult = await updatePalResponse.json();
      console.log('Pal updated with image keys successfully:', updatePalResult);

      // Success!
      setIsSharing(false);
      setCurrentStep(3);

    } catch (err) {
      console.error('Error sharing to PalForge:', err);
      setIsSharing(false);
      
      let errorMessage = 'An unknown error occurred while sharing to PalForge.';
      
      // Type guard for error handling similar to Actions.tsx
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const responseError = err as { response?: { data?: { error?: string } } };
        if (responseError.response && responseError.response.data && typeof responseError.response.data.error === 'string') {
          errorMessage = responseError.response.data.error;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setThumbnailImage(null);
    setImagePreview(null);
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="modal-content share-to-palforge-modal">
        <button className="modal-close-icon" onClick={onClose}>
          <CloseIcon size={18} />
        </button>

        {showCropper ? (
          <div className="image-cropper-container">
            <div className="cropper-header">
              <h3>Crop Your Image</h3>
              <p>Adjust the image to fit the 16:9 aspect ratio</p>
            </div>
            
            <div className="cropper-area">
              <Cropper
                image={cropImage!}
                crop={crop}
                zoom={zoom}
                aspect={16 / 9}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            
            <div className="cropper-controls">
              <div className="zoom-control">
                <label>Zoom</label>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </div>
              
              <div className="cropper-buttons">
                <button className="crop-cancel-button" onClick={handleCropCancel}>
                  Cancel
                </button>
                <button className="crop-done-button" onClick={handleCropDone}>
                  <Check size={16} />
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {currentStep !== 3 && (
              <div className="share-modal-header">
                <h2>Share to PalForge</h2>
                <p className="share-modal-subtitle">
                  Please <a href="http://minepal.net/palforge/rules" target="_blank" rel="noopener noreferrer">adhere to our rules</a> when sharing to PalForge
                </p>
              </div>
            )}

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
                        <span className="file-hint">JPG, PNG up to 15MB</span>
                      </div>
                    )}
                    <input
                      id="image-input"
                      type="file"
                      accept="image/jpeg,image/png"
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
            ) : currentStep === 2 ? (
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
            ) : currentStep === 3 ? (
              <div className="share-modal-step share-modal-step--success">
                <div className="success-content">
                  <div className="success-icon">
                    <Check size={24} />
                  </div>
                  <h3>Successfully Shared to PalForge!</h3>
                  <p>Your Pal "{profile.name}" has been shared and is now available on PalForge.</p>
                  
                  {sharedPalId && (
                    <div className="pal-link-section">
                      <label>View Your Pal:</label>
                      <div className="pal-link-container">
                        <a 
                          href={`https://minepal.net/palforge/${sharedPalId}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="pal-link"
                        >
                          https://minepal.net/palforge/{sharedPalId}
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                <div className="modal-actions">
                  <button className="done-button" onClick={onClose}>
                    Done
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
        
        {error && <div className="error-message">{error}</div>}
      </div>
    </ModalWrapper>
  );
}

export default ShareToPalForgeModal; 