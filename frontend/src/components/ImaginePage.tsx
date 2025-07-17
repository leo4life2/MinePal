import { useState, useEffect, useRef } from 'react';
import { LifeBuoy, Play, Plus, X, Check } from 'react-feather';
import { useSupabase } from '../contexts/SupabaseContext/useSupabase';
import { HTTPS_BACKEND_URL } from '../constants';
import { ModalWrapper } from './Modal';

const ImaginePage = () => {
  const { imagineCredits, supabase } = useSupabase();
  const credits = imagineCredits ?? 0;
  const [mode, setMode] = useState<'Normal' | 'Detailed'>('Normal');
  const [prompt, setPrompt] = useState('');
  const [selectedPal, setSelectedPal] = useState('Steve');
  const [isImagining, setIsImagining] = useState(false);
  // @ts-expect-error - selectedImage will be used for image upload feature later
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [structureId, setStructureId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(60); // 60 seconds initial estimate
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
  const mockPals = ['Steve', 'Alex', 'Builder1']; // Mock pal list

  // Fake progress animation effect
  useEffect(() => {
    if (isImagining) {
      setProgress(0);
      setTimeRemaining(60);
      
      let elapsed = 0;
      progressIntervalRef.current = setInterval(() => {
        elapsed += 0.5; // Update every 500ms
        
        // Sharp logarithmic curve - starts very slow, gradually speeds up, then slows down
        // Using a sigmoid-like function for more natural feel
        const normalizedTime = elapsed / 60; // Normalize to 0-1 over 60 seconds
        const sigmoidProgress = 95 * (1 / (1 + Math.exp(-8 * (normalizedTime - 0.5))));
        const fakeProgress = Math.min(95, sigmoidProgress);
        setProgress(fakeProgress);
        
        // Time remaining follows the same curve (inverse of progress)
        // At 0% progress: 60s remaining
        // At 50% progress: ~25s remaining  
        // At 95% progress: gets stuck around 3-8s
        const progressRatio = fakeProgress / 100;
        const baseRemaining = 60 * (1 - progressRatio);
        
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
  }, [isImagining]);

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

        const response = await fetch(`${HTTPS_BACKEND_URL}/imagine`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            buildPrompt: prompt,
            mode: mode.toLowerCase() // Convert "Normal"/"Detailed" to "normal"/"detailed"
          })
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
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
          setShowSuccessModal(true);
          setError(null);
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
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
      if (file.size > 15 * 1024 * 1024) {
        alert('File size must be under 15MB');
        return;
      }
      
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
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

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
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
                  <X size={12} />
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

        {/* Pal Selector */}
        <div className="pal-selector-row">
          <label className="input-label pal-label">
            <span>Generate on Pal?</span>
          </label>
          <select 
            value={selectedPal} 
            onChange={(e) => setSelectedPal(e.target.value)}
            className="pal-select"
          >
            {mockPals.map(pal => (
              <option key={pal} value={pal}>{pal}</option>
            ))}
          </select>
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

      {/* Success Modal */}
      {showSuccessModal && structureId && (
        <ModalWrapper onClose={() => setShowSuccessModal(false)}>
          <div className="modal-content imagine-success-modal">
            <button className="modal-close-icon" onClick={() => setShowSuccessModal(false)}>
              <X size={18} />
            </button>
            
            <div className="success-content">
              <div className="success-icon">
                <Check size={24} />
              </div>
              <h3>Imagine Complete!</h3>
              <p>Your imagined structure&apos;s ID is {structureId}, tell your pal to generate it in game!</p>
              
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

            <div className="modal-actions">
              <button className="done-button" onClick={() => setShowSuccessModal(false)}>
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