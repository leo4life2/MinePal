import { useCallback, useEffect, useState } from "react";
import { useErrorReport } from "../contexts/ErrorReportContext/ErrorReportContext";

const store: { [key: string]: unknown } = {};

export default function useWebRequest<T>(key: string | string[], fetcher: () => Promise<T>) {
  const truekey = Array.isArray(key) ? key.join("-") : key;
  const { declareError } = useErrorReport();

  const [isLoading, setIsLoading] = useState(!store[truekey]);
  const [isRefetching, setIsRefetching] = useState(false);
  const [data, setData] = useState<T>(store[truekey] as T);
  const [error, setError] = useState<unknown>();

  const getData = useCallback(async () => {
    try {
      const data = await fetcher()
      setData(data);
      store[truekey] = data;

      return data;
    } catch (error) {
      setError(error);
      declareError(`useWebRequest(${truekey})`, error);
    } finally {
      setIsLoading(false);
    }
  }, [declareError, fetcher, truekey])

  useEffect(() => {
    if (store[truekey]) return;

    setIsLoading(true);
    getData();
  }, [fetcher, getData, truekey]);

  const refetch = useCallback(async () => {
    setIsRefetching(true);
    const data = await getData();
    setIsRefetching(false);
    return data;
  }, [getData]);

  return { isLoading, data, error, refetch, isRefetching };
}
