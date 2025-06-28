import { useState } from 'react';
import { LifeBuoy, Play, Plus, X } from 'react-feather';

const ImaginePage = () => {
  const [credits] = useState(42); // Mock credits
  const [mode, setMode] = useState<'Normal' | 'Detailed'>('Normal');
  const [prompt, setPrompt] = useState('');
  const [selectedPal, setSelectedPal] = useState('Steve');
  const [isImagining, setIsImagining] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  const handleImagine = () => {
    if (credits >= creditCost && prompt.trim()) {
      setIsImagining(true);
      // Mock completion after 3 seconds
      setTimeout(() => {
        setIsImagining(false);
      }, 3000);
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
            className="imagine-button"
            onClick={handleImagine}
            disabled={isImagining || credits < creditCost || !prompt.trim()}
          >
            <Play size={16} />
            {isImagining ? 'Imagining...' : 'Imagine'}
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

        {/* Status Display */}
        {isImagining && (
          <div className="status-display imagining">
            <div className="spinner"></div>
            <span>Imagining...</span>
          </div>
        )}


      </div>

      
    </div>
  );
};

export default ImaginePage; 