import { useCallback, useState } from "react";
import { getISOTimestamp } from "../../utils/date";
import { ErrorReportContext } from "./ErrorReportContext";

export default function ErrorReportProvider({ children }: React.PropsWithChildren) {
  const [error, setError] = useState<Error | unknown>()

  const declareError = useCallback((context: string, error: unknown, displayToUser: boolean = false) => {
    console.error(`${getISOTimestamp(new Date())} - Minepal - ${context}:`, error);
    if (displayToUser) {
      setError(error);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return (
    <ErrorReportContext.Provider value={{ error, declareError, clearError }}>
      {children}
    </ErrorReportContext.Provider>
  )
}
