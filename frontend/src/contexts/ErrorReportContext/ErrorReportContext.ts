import { createContext, useContext } from "react";

type ErrorReportContextType = {
  error?: unknown;
  clearError: () => void;
  declareError: (context: string, error: unknown, displayToUser?: boolean) => void;
}

const DEFAULT_ERROR_REPORT_CONTEXT: ErrorReportContextType = {
  clearError: () => { },
  declareError: () => { },
}

export const ErrorReportContext = createContext<ErrorReportContextType>(DEFAULT_ERROR_REPORT_CONTEXT);

export function useErrorReport() {
  return useContext(ErrorReportContext);
}
