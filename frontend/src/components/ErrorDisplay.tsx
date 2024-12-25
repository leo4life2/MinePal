import { useErrorReport } from '../contexts/ErrorReportContext/ErrorReportContext';

export default function ErrorDisplay() {
  const { error } = useErrorReport();

  if (!error) return null;

  return (
    <div className="error-message">
      {error instanceof Error && error.message}
      {typeof error === "string" && error}
    </div>
  );
}
