import { useState, useEffect, useRef, MouseEvent } from 'react';
import { Play, ChevronDown, Pause } from 'react-feather';
import './VoiceSelector.css';

export interface VoiceOption {
  id: string;
  name: string;
  audioUrl: string; // URL to the audio sample
}

interface VoiceSelectorProps {
  options: VoiceOption[];
  selectedId: string | undefined;
  onChange: (id: string) => void;
  placeholder?: string;
}

function VoiceSelector({ 
  options, 
  selectedId, 
  onChange, 
  placeholder = "Select a voice..." 
}: VoiceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [nowPlayingUrl, setNowPlayingUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const selectedOption = options.find(opt => opt.id === selectedId);

  // Initialize or get the audio player
  const getAudioPlayer = () => {
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
      audioPlayerRef.current.onended = () => setNowPlayingUrl(null); // Clear playing state on end
      audioPlayerRef.current.onerror = () => {
        console.error("Error with audio player");
        setNowPlayingUrl(null);
      };
    }
    return audioPlayerRef.current;
  };

  const handleToggleDropdown = () => setIsOpen(!isOpen);

  const handleSelectOption = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
  };

  const handlePlayAudio = (e: MouseEvent<HTMLButtonElement>, audioUrl: string) => {
    e.stopPropagation();
    const player = getAudioPlayer();

    if (player.src === audioUrl && !player.paused) { // If same audio is playing, pause it
      player.pause();
      setNowPlayingUrl(null);
    } else { // If different audio or paused/stopped
      if (player.src !== audioUrl) {
        player.src = audioUrl;
      }
      player.play()
        .then(() => setNowPlayingUrl(audioUrl))
        .catch(error => {
          console.error("Error playing audio:", error);
          setNowPlayingUrl(null);
        });
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    const player = audioPlayerRef.current; // Capture current value for cleanup
    return () => {
      if (player) {
        player.pause();
        player.onended = null; // Remove event listeners
        player.onerror = null;
        audioPlayerRef.current = null; // Clear the ref
      }
    };
  }, []);

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="voice-selector-container" ref={containerRef}>
      <div 
        className={`voice-selector-selected ${isOpen ? 'open' : ''}`}
        onClick={handleToggleDropdown}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleToggleDropdown()}
      >
        <span className="voice-selector-name">
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        {selectedOption && (
          <button 
            className="voice-selector-play-button"
            onClick={(e) => handlePlayAudio(e, selectedOption.audioUrl)}
            aria-label={`Play ${selectedOption.name}`}
          >
            {nowPlayingUrl === selectedOption.audioUrl ? <Pause size={16} /> : <Play size={16} />}
          </button>
        )}
        <ChevronDown className={`voice-selector-chevron ${isOpen ? 'open' : ''}`} size={20} />
      </div>

      {isOpen && (
        <div className="voice-selector-dropdown" role="listbox">
          {options.length > 0 ? options.map(option => (
            <div
              key={option.id}
              className={`voice-selector-option ${selectedId === option.id ? 'selected' : ''}`}
              onClick={() => handleSelectOption(option.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelectOption(option.id)}
              role="option"
              aria-selected={selectedId === option.id}
              tabIndex={0}
            >
              <span className="voice-selector-name">{option.name}</span>
              <button 
                className="voice-selector-play-button"
                onClick={(e) => handlePlayAudio(e, option.audioUrl)}
                aria-label={`Play ${option.name}`}
              >
                {nowPlayingUrl === option.audioUrl ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </div>
          )) : (
            <div className="voice-selector-option">No voices available</div>
          )}
        </div>
      )}
    </div>
  );
}

export default VoiceSelector; 