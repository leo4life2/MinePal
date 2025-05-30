import { useEffect } from 'react';
import { Profile } from '../types/apiTypes';
import { IpcRendererEvent } from 'electron';
import { useSupabase } from '../contexts/SupabaseContext/useSupabase';

// Get electron IPC renderer if we're in electron
const isElectron = window && window.process && window.process.type;
const electron = isElectron ? window.require('electron') : null;
const ipcRenderer = electron?.ipcRenderer;

interface UseDeepLinksProps {
  onImportPal: (profile: Profile) => Promise<void>;
}

export function useDeepLinks({ onImportPal }: UseDeepLinksProps) {
  const { supabase } = useSupabase();
  
  useEffect(() => {
    if (!ipcRenderer) return;

    const handleImportPalCallback = async (_event: IpcRendererEvent, url: string) => {
      try {
        console.log('Import pal callback received:', url);
        
        const urlObj = new URL(url);
        
        // Validate this is actually an import/pal URL
        if (!url.includes('/import/pal')) {
          console.warn('Received non-import-pal URL in import callback:', url);
          return;
        }
        
        // Extract query parameters
        const name = urlObj.searchParams.get('name');
        const identity_prompt = urlObj.searchParams.get('identity_prompt');
        const pal_voice = urlObj.searchParams.get('pal_voice');
        const pal_id = urlObj.searchParams.get('pal_id');
        
        // Validate required parameters
        if (!name || !identity_prompt) {
          throw new Error('Missing required parameters: name and identity_prompt are required');
        }
        
        // Create profile object with defaults
        const importedProfile: Profile = {
          name: decodeURIComponent(name).trim(),
          personality: decodeURIComponent(identity_prompt).trim(),
          base_voice_id: pal_voice ? decodeURIComponent(pal_voice) : undefined,
          // Default values for all other fields
          autoMessage: '',
          triggerOnJoin: false,
          triggerOnRespawn: false,
          enable_voice: false,
          voice_only_mode: false,
          enable_rare_finds: false,
          enable_entity_sleep: false,
          enable_entity_hurt: false,
          enable_silence_timer: false,
          enable_weather_listener: false,
        };
        
        // Validate name and personality are not empty after trimming
        if (!importedProfile.name || !importedProfile.personality) {
          throw new Error('Name and personality cannot be empty');
        }
        
        // Call the import handler
        await onImportPal(importedProfile);
        
        // Increment num_forges count if pal_id is provided
        if (pal_id) {
          try {
            const palIdNumber = parseInt(pal_id, 10);
            if (!isNaN(palIdNumber)) {
              // First, get the current num_forges value
              const { data: palData, error: fetchError } = await supabase
                .from('pals')
                .select('num_forges')
                .eq('id', palIdNumber)
                .single();
              
              if (fetchError) {
                console.error('Failed to fetch current num_forges:', fetchError);
              } else if (palData) {
                // Increment and update
                const newNumForges = (palData.num_forges || 0) + 1;
                const { error: updateError } = await supabase
                  .from('pals')
                  .update({ num_forges: newNumForges})
                  .eq('id', palIdNumber);
                
                if (updateError) {
                  console.error('Failed to update num_forges:', updateError);
                }
              }
            } else {
              console.warn('Invalid pal_id format:', pal_id);
            }
          } catch (dbError) {
            console.error('Error updating num_forges:', dbError);
            // Don't throw here as the pal import was successful
          }
        }
        
      } catch (error) {
        console.error('Error handling import pal callback:', error);
        // Show user-facing error
        const errorMessage = error instanceof Error ? error.message : 'Failed to import pal from link';
        alert(`Import Failed: ${errorMessage}`);
      }
    };
    
    // Listen for import-pal-callback events
    ipcRenderer.on('import-pal-callback', handleImportPalCallback);
    
    return () => {
      ipcRenderer.removeListener('import-pal-callback', handleImportPalCallback);
    };
  }, [onImportPal]);
}

export default useDeepLinks; 