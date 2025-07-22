import { useState, useEffect, useRef } from 'react';
import { LifeBuoy, Play, Plus, X, Check, AlignLeft, ChevronDown, ChevronUp } from 'react-feather';
import { useSupabase } from '../contexts/SupabaseContext/useSupabase';
import { HTTPS_BACKEND_URL } from '../constants';
import { ModalWrapper } from './Modal';
// @ts-expect-error SVG import with React component syntax not recognized by TypeScript
import BrainIcon from '../assets/brain.svg?react';
import './ImaginePage.css';

interface Structure {
  id: number;
  prompt: string;
  mode: string;
  created_at: string;
  description_text?: string;
  reasoning_text?: string;
}

interface ImagineRequest {
  buildPrompt: string;
  mode: string;
  imageBase64?: string;
  mediaType?: string;
}

const ImaginePage = () => {
  const { imagineCredits, supabase, user } = useSupabase();
  const credits = imagineCredits ?? 0;
  const [mode, setMode] = useState<'Normal' | 'Detailed'>('Normal');
  const [prompt, setPrompt] = useState('');
  const [isImagining, setIsImagining] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [structureId, setStructureId] = useState<number | null>(null);
  const [descriptionText, setDescriptionText] = useState<string>('');
  const [reasoningText, setReasoningText] = useState<string>('');
  const [isThoughtProcessExpanded, setIsThoughtProcessExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(60); // 60 seconds initial estimate
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [loadingStructures, setLoadingStructures] = useState(false);
  const [structuresError, setStructuresError] = useState<string | null>(null);
  const [selectedStructure, setSelectedStructure] = useState<Structure | null>(null);
  const [showStructureModal, setShowStructureModal] = useState(false);

  const detailedPrompts = [
    "A floating crystal observatory made of amethyst blocks and tinted glass, suspended 200 blocks above a misty swamp with glowing sea lantern constellations and hanging gardens of glowberries cascading down like ethereal waterfalls",
    "An underground bioluminescent mushroom metropolis carved into a massive cave system, with towering red and brown mushroom skyscrapers connected by mycelium bridges, shroomlight street lamps, and hidden fairy ring teleportation circles",
    "A steampunk clockwork citadel built from copper blocks and oxidized copper, featuring massive gear-shaped windows, steam-powered elevators made of pistons and redstone, brass telescope domes, and industrial chimneys releasing white concrete powder 'smoke'",
    "An ancient treehouse civilization woven through the canopy of a colossal dark oak forest, with spiral bark staircases, leaf-roof cottages, vine rope bridges swaying between branches, and hidden owl nesting boxes made of birch",
    "A crystalline ice palace perched on a frozen mountain peak, constructed from packed ice and blue ice with frozen waterfall columns, aurora-colored stained glass walls, snow golem sentries, and throne rooms carved from solid ice blocks",
    "A levitating desert mirage city built on floating sand platforms, featuring ancient sandstone ziggurats with hieroglyph-covered walls, oasis pools suspended in mid-air, palm tree groves on floating islands, and golden beacon pyramids",
    "An underwater coral metropolis encased in massive glass domes, with living coral skyscrapers made of coral blocks, kelp forests as vertical gardens, sea pickle street lights, and pressurized air chambers connected by glass tunnels",
    "A witch's spiral tower laboratory rising from a dark swamp, built with blackstone and crying obsidian, featuring brewing stations on every floor, cauldron balconies bubbling with mysterious potions, and a rooftop garden of suspicious stew ingredients",
    "A Japanese-inspired floating temple complex on cherry blossom islands, with multi-tiered pagoda roofs of red and white concrete, zen rock gardens of smooth stone, koi ponds with tropical fish, and meditation pavilions surrounded by bamboo forests",
    "A dwarven mountain forge-city carved directly into a cliff face, with multiple levels connected by minecart railways, massive furnace chambers glowing with lava, anvil workshops, treasure vaults behind hidden piston doors, and a great hall with a throne of solid gold blocks"
  ];

  const [randomPlaceholder] = useState(() => {
    return detailedPrompts[Math.floor(Math.random() * detailedPrompts.length)];
  });


  const creditCost = mode === 'Normal' ? 1 : 3;

  // Fetch user's structures when component mounts or user changes
  useEffect(() => {
    if (user) {
      fetchStructures();
    }
  }, [user]);

  const fetchStructures = async () => {
    if (!user) return;
    
    setLoadingStructures(true);
    setStructuresError(null);
    try {
      const { data, error } = await supabase
        .from('structures')
        .select('id, prompt, mode, created_at, description_text, reasoning_text')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching structures:', error);
        setStructuresError('Failed to load your previous structures');
        return;
      }

      setStructures(data || []);
    } catch (err) {
      console.error('Failed to fetch structures:', err);
      setStructuresError('Failed to load your previous structures');
    } finally {
      setLoadingStructures(false);
    }
  };

  // Fake progress animation effect
  useEffect(() => {
    if (isImagining) {
      // Different durations based on mode
      const totalDuration = mode === 'Normal' ? 50 : 70;
      
      setProgress(0);
      setTimeRemaining(totalDuration);
      
      let elapsed = 0;
      progressIntervalRef.current = setInterval(() => {
        elapsed += 0.5; // Update every 500ms
        
        // Sharp logarithmic curve - starts very slow, gradually speeds up, then slows down
        // Using a sigmoid-like function for more natural feel
        const normalizedTime = elapsed / totalDuration; // Normalize to 0-1 over total duration
        const sigmoidProgress = 95 * (1 / (1 + Math.exp(-8 * (normalizedTime - 0.5))));
        const fakeProgress = Math.min(95, sigmoidProgress);
        setProgress(fakeProgress);
        
        // Time remaining follows the same curve (inverse of progress)
        // At 0% progress: totalDuration remaining
        // At 50% progress: ~half remaining  
        // At 95% progress: gets stuck around 3-8s
        const progressRatio = fakeProgress / 100;
        const baseRemaining = totalDuration * (1 - progressRatio);
        
        // Add some stickiness at the end - gets stuck between 3-8 seconds
        let remaining;
        if (fakeProgress >= 90) {
          remaining = Math.max(3, Math.min(8, Math.round(baseRemaining + Math.random() * 2)));
        } else if (fakeProgress >= 80) {
          remaining = Math.max(8, Math.round(baseRemaining));
        } else {
          remaining = Math.max(0, Math.round(baseRemaining));
        }
        
        setTimeRemaining(remaining);
        
        // Stop updating if we're at 95% progress
        if (fakeProgress >= 95) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
        }
      }, 500);
    } else {
      // Clear interval when not imagining
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
    
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isImagining, mode]);

  const compressImageToSize = async (canvas: HTMLCanvasElement, mediaType: string, maxSizeBytes: number): Promise<Blob> => {
    return new Promise((resolve) => {
      let quality = 0.9;
      const tryCompress = () => {
        canvas.toBlob((blob) => {
          if (blob && (blob.size <= maxSizeBytes || quality <= 0.1)) {
            resolve(blob);
          } else {
            quality -= 0.1;
            tryCompress();
          }
        }, mediaType, quality);
      };
      tryCompress();
    });
  };

  const handleImagine = async () => {
    if (credits >= creditCost && prompt.trim()) {
      setIsImagining(true);
      setError(null); // Clear any previous errors
      
      try {
        // Get the current session for JWT
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.access_token) {
          throw new Error('No authentication token available');
        }

        // Build request body
        const requestBody: ImagineRequest = {
          buildPrompt: prompt,
          mode: mode.toLowerCase() // Convert "Normal"/"Detailed" to "normal"/"detailed"
        };

        // Add image data if available
        if (imageBase64 && imageMediaType) {
          requestBody.imageBase64 = imageBase64;
          requestBody.mediaType = imageMediaType;
        }

        const response = await fetch(`${HTTPS_BACKEND_URL}/imagine`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          // Try to get the error message from the response body
          let errorMessage = `API request failed: ${response.status}`;
          try {
            const errorData = await response.json();
            if (errorData.error) {
              errorMessage = errorData.error;
            }
          } catch {
            // If we can't parse the response, stick with the generic message
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log('Imagine result:', result);
        
        // Handle successful response
        if (result.success && result.structure?.id) {
          // Jump to 100% completion
          setProgress(100);
          setTimeRemaining(0);
          
          // Small delay to show completion before modal
          await new Promise(resolve => setTimeout(resolve, 500));
          
          setStructureId(result.structure.id);
          setDescriptionText(result.structure.descriptionText || '');
          setReasoningText(result.structure.reasoningText || '');
          setShowSuccessModal(true);
          setError(null);
          
          // Refresh the structures list
          await fetchStructures();
        } else {
          throw new Error('Invalid response format');
        }
        
      } catch (err) {
        console.error('Error calling imagine API:', err);
        
        let errorMessage = 'An unknown error occurred while imagining the structure.';
        
        if (err instanceof Error) {
          errorMessage = err.message;
        } else if (typeof err === 'object' && err !== null && 'response' in err) {
          const responseError = err as { response?: { data?: { error?: string } } };
          if (responseError.response?.data?.error) {
            errorMessage = responseError.response.data.error;
          }
        }
        
        setError(errorMessage);
        setShowSuccessModal(false);
      } finally {
        setIsImagining(false);
      }
    }
  };

  const handleImageSelect = (file: File) => {
    // Only allow jpeg, jpg, and png
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const mediaType = file.type === 'image/jpg' ? 'image/jpeg' : file.type; // Normalize jpg to jpeg
    
    if (!allowedTypes.includes(mediaType)) {
      alert('Please select a JPG or PNG file');
      return;
    }
    
    if (file.size > 15 * 1024 * 1024) {
      alert('File size must be under 15MB');
      return;
    }
    
    setImageBase64(null); // Clear previous image data
    setImageMediaType(mediaType);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        // Check if we need to scale down
        const maxDimension = 1024;
        const longSide = Math.max(img.width, img.height);
        const maxFileSize = 750 * 1024; // 750kb
        
        if (longSide > maxDimension) {
          // Calculate scale factor
          const scale = maxDimension / longSide;
          const newWidth = Math.round(img.width * scale);
          const newHeight = Math.round(img.height * scale);
          
          // Create canvas for scaling
          const canvas = document.createElement('canvas');
          canvas.width = newWidth;
          canvas.height = newHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            // Draw scaled image
            ctx.drawImage(img, 0, 0, newWidth, newHeight);
            
            // Compress to under 750kb
            const compressedBlob = await compressImageToSize(canvas, mediaType, maxFileSize);
            
            const scaledReader = new FileReader();
            scaledReader.onloadend = () => {
              const base64String = (scaledReader.result as string).split(',')[1];
              setImageBase64(base64String);
              setImagePreview(scaledReader.result as string);
            };
            scaledReader.readAsDataURL(compressedBlob);
          }
        } else {
          // Image is already small enough dimensionally, but check file size
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            
            // Compress to under 750kb
            const compressedBlob = await compressImageToSize(canvas, mediaType, maxFileSize);
            
            const unscaledReader = new FileReader();
            unscaledReader.onloadend = () => {
              const base64String = (unscaledReader.result as string).split(',')[1];
              setImageBase64(base64String);
              setImagePreview(unscaledReader.result as string);
            };
            unscaledReader.readAsDataURL(compressedBlob);
          }
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
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

  const removeImage = () => {
    setImagePreview(null);
    setImageBase64(null);
    setImageMediaType(null);
  };



  return (
    <div className="imagine-page">
      {/* Imagine Form */}
      <div className="imagine-section">
        <h3 className="section-title">Imagine Structure</h3>
        <p className="imagine-description">
          Imagine once, build forever. Every creation goes public on PalForge, free for anyone to use.
        </p>
        
        {/* Mode Selector */}
        <div className="mode-selector">
          <label className="input-label">Mode</label>
          <div className="mode-buttons">
            <button 
              className={`mode-button ${mode === 'Normal' ? 'active' : ''}`}
              onClick={() => setMode('Normal')}
            >
              <span>Normal&nbsp;&nbsp;&nbsp;<span className="mode-credit-number">1</span></span>
              <LifeBuoy className="mode-credit-icon" size={14} />
            </button>
            <button 
              className={`mode-button ${mode === 'Detailed' ? 'active' : ''}`}
              onClick={() => setMode('Detailed')}
            >
              <span>Detailed&nbsp;&nbsp;&nbsp;<span className="mode-credit-number">3</span></span>
              <LifeBuoy className="mode-credit-icon" size={14} />
            </button>
          </div>
        </div>

        {/* Prompt Input */}
        <div className="prompt-section">
          <label htmlFor="prompt" className="input-label">Describe your structure</label>
          <textarea
            id="prompt"
            className="imagine-prompt-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={randomPlaceholder}
            rows={6}
          />
        </div>

        {/* Image Upload */}
        <div className="imagine-image-upload-section">
          <label className="input-label">Attach an image?</label>
          <div 
            className={`imagine-image-upload-box ${isDragging ? 'dragging' : ''} ${imagePreview ? 'has-image' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !imagePreview && document.getElementById('image-input')?.click()}
          >
            {imagePreview ? (
              <div className="imagine-image-preview-container">
                <img src={imagePreview} alt="Structure preview" className="imagine-image-preview" />
                <button className="imagine-remove-image-button" onClick={(e) => {
                  e.stopPropagation();
                  removeImage();
                }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="imagine-upload-placeholder">
                +
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

        {/* Imagine Button Row */}
        <div className="imagine-button-row">
          <button 
            className={`imagine-button ${isImagining ? 'imagining' : ''}`}
            onClick={handleImagine}
            disabled={isImagining || credits < creditCost || !prompt.trim()}
          >
            {isImagining ? (
              <>
                {/* Progress bar background */}
                <div 
                  className="imagine-progress-bar" 
                  style={{ width: `${progress}%` }}
                />
                {/* Content on top of progress bar */}
                <div className="imagine-progress-content">
                  <div className="imagine-spinner"></div>
                  <span className="imagine-progress-text">
                    {progress < 100 ? `${Math.round(progress)}%` : 'Complete!'}
                  </span>
                  {timeRemaining > 0 && (
                    <span className="imagine-time-remaining">
                      ~{timeRemaining}s
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <Play size={16} />
                Imagine
              </>
            )}
          </button>
          <div className="credits-container">
            <button className="credits-plus-button">
              <Plus size={16} />
            </button>
            <div className="credits-display">
              <span className="credits-text">{credits}</span>
              <LifeBuoy className="credits-icon" size={18} />
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="error-message">{error}</div>
        )}

      </div>

      {/* Previous Structures Section */}
      {user && (
        <div className="previous-structures-section">
          <h3 className="section-title">Your Previous Imagines</h3>
          
          {loadingStructures ? (
            <div className="structures-loading">Loading your structures...</div>
          ) : structuresError ? (
            <div className="structures-error">{structuresError}</div>
          ) : structures.length === 0 ? (
            <div className="structures-empty">
              <p>You haven&apos;t imagined any structures yet.</p>
            </div>
          ) : (
            <div className="structures-grid">
              {structures.map((structure) => (
                <div 
                  key={structure.id} 
                  className="structure-card"
                  onClick={() => {
                    setSelectedStructure(structure);
                    setShowStructureModal(true);
                    setIsThoughtProcessExpanded(false);
                  }}
                >
                  <div className="structure-card-header">
                    <span className="structure-id">#{structure.id}</span>
                    <span className={`structure-mode-tag ${structure.mode.toLowerCase()}`}>
                      {structure.mode}
                    </span>
                  </div>
                  <p className="structure-prompt">{structure.prompt}</p>
                  <span className="structure-date">
                    {new Date(structure.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && structureId && (
        <ModalWrapper onClose={() => {
          setShowSuccessModal(false);
          setIsThoughtProcessExpanded(false);
        }}>
          <div className="modal-content imagine-success-modal">
            <button className="modal-close-icon" onClick={() => {
              setShowSuccessModal(false);
              setIsThoughtProcessExpanded(false);
            }}>
              <X size={18} />
            </button>
            
            <div className="success-content">
              <div className="success-icon">
                <Check size={24} />
              </div>
              <h3>Imagine Complete!</h3>
              <div className="structure-id-message">
                Your imagined structure&apos;s ID is <span className="structure-id-highlight">{structureId}</span> , tell your pal to generate it in game!
              </div>
              
              {descriptionText && (
                <div className="structure-description">
                  <div className="structure-description-header">
                    <AlignLeft size={17} />
                    <span>Notes from MinePal AI</span>
                  </div>
                  <div className="structure-description-content">{descriptionText}</div>
                </div>
              )}
              
              {reasoningText && (
                <div className="thought-process">
                  <div 
                    className="thought-process-header clickable"
                    onClick={() => setIsThoughtProcessExpanded(!isThoughtProcessExpanded)}
                  >
                    <BrainIcon width={17} height={17} />
                    <span>AI Thought Process</span>
                    {isThoughtProcessExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                  {isThoughtProcessExpanded && (
                    <div className="thought-process-content">{reasoningText}</div>
                  )}
                </div>
              )}
              
              <div className="structure-link-section">
                <label>View Structure:</label>
                <div className="structure-link-container">
                  <a 
                    href={`https://minepal.net/palforge/structures/${structureId}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="structure-link"
                  >
                    minepal.net/palforge/structures/{structureId}
                  </a>
                </div>
              </div>
            </div>

            <div className="imagine-modal-actions">
              <button className="done-button" onClick={() => {
                setShowSuccessModal(false);
                setIsThoughtProcessExpanded(false);
              }}>
                Done
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}
      
      {/* Structure View Modal */}
      {showStructureModal && selectedStructure && (
        <ModalWrapper onClose={() => {
          setShowStructureModal(false);
          setIsThoughtProcessExpanded(false);
        }}>
          <div className="modal-content imagine-success-modal">
            <button className="modal-close-icon" onClick={() => {
              setShowStructureModal(false);
              setIsThoughtProcessExpanded(false);
            }}>
              <X size={18} />
            </button>
            
            <div className="success-content">
              <h3 className="structure-modal-title">#{selectedStructure.id}</h3>
              
              <div className="structure-modal-prompt">
                {selectedStructure.prompt}
              </div>
              
              {selectedStructure.description_text && (
                <div className="structure-description">
                  <div className="structure-description-header">
                    <AlignLeft size={17} />
                    <span>Notes From MinePal AI</span>
                  </div>
                  <div className="structure-description-content">{selectedStructure.description_text}</div>
                </div>
              )}
              
              {selectedStructure.reasoning_text && (
                <div className="thought-process">
                  <div 
                    className="thought-process-header clickable"
                    onClick={() => setIsThoughtProcessExpanded(!isThoughtProcessExpanded)}
                  >
                    <BrainIcon width={17} height={17} />
                    <span>AI Thought Process</span>
                    {isThoughtProcessExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                  {isThoughtProcessExpanded && (
                    <div className="thought-process-content">{selectedStructure.reasoning_text}</div>
                  )}
                </div>
              )}
              
              <div className="structure-link-section">
                <label>View Structure:</label>
                <div className="structure-link-container">
                  <a 
                    href={`https://minepal.net/palforge/structures/${selectedStructure.id}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="structure-link"
                  >
                    minepal.net/palforge/structures/{selectedStructure.id}
                  </a>
                </div>
              </div>
            </div>

            <div className="imagine-modal-actions">
              <button className="done-button" onClick={() => {
                setShowStructureModal(false);
                setIsThoughtProcessExpanded(false);
              }}>
                Done
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}
      
    </div>
  );
};

export default ImaginePage; 