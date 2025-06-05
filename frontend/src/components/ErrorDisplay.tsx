import { useEffect, useState } from 'react';
import { useErrorReport } from '../contexts/ErrorReportContext/ErrorReportContext';
import './ErrorDisplay.css';

export default function ErrorDisplay() {
  const { error } = useErrorReport();
  const [isNewError, setIsNewError] = useState(false);

  // Auto-scroll to bottom when error appears and trigger animation
  useEffect(() => {
    if (error) {
      setIsNewError(true);
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
      
      // Remove animation class after animation completes
      const timer = setTimeout(() => {
        setIsNewError(false);
      }, 600); // Match animation duration
      
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (!error) return null;

  return (
    <div className={`error-message ${isNewError ? 'error-message--new' : ''}`}>
      {error instanceof Error && error.message}
      {typeof error === "string" && error}
    </div>
  );
}
