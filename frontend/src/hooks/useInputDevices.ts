import { useState, useEffect, useCallback } from 'react';
import { useErrorReport } from '../contexts/ErrorReportContext/ErrorReportContext';

export default function useInputDevices() {
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const { declareError } = useErrorReport();

  const refreshInputDevices = useCallback(async () => {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "audioinput");
      setInputDevices(devices);
    } catch (error) {
      declareError("useInputDevices", error);
    }
  }, [declareError]);

  useEffect(() => {
    refreshInputDevices();
  }, [refreshInputDevices]);

  return { inputDevices, refreshInputDevices };
}
