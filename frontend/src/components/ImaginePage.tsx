import { useState } from 'react';
import { LifeBuoy, Play } from 'react-feather';

const ImaginePage = () => {
  const [credits] = useState(42); // Mock credits
  const [mode, setMode] = useState<'Normal' | 'Detailed'>('Normal');
  const [prompt, setPrompt] = useState('');
  const [selectedPal, setSelectedPal] = useState('Steve');
  const [isImagining, setIsImagining] = useState(false);


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
          <div className="textarea-container">
            <textarea
              id="prompt"
              className="imagine-prompt-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder=""
              rows={6}
            />
            {!prompt && (
              <div className="custom-placeholder">
                <div>Good prompts:</div>
                <div>• &quot;A medieval castle with tall towers and a moat&quot;</div>
                <div>• &quot;A modern glass skyscraper with LED lighting&quot;</div>
                <div>• &quot;A cozy wooden cabin in a forest clearing&quot;</div>
                <div></div>
                <div>Be specific: Include materials, size, style, and setting for best results.</div>
              </div>
            )}
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
          <div className="credits-display">
            <LifeBuoy className="credits-icon" size={18} />
            <span className="credits-text">{credits}</span>
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