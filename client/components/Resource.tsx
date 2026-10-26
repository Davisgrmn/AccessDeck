import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../auth';

export function Resource<T>({ path, children }: { path: string; children: (data: T) => ReactNode }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal }).then(setData).catch((failure) => {
      if (!controller.signal.aborted) setError(failure);
    });
    return () => controller.abort();
  }, [path]);
  if (error) return <div className="alert alert-warning" role="alert">{error.message} {error.status === 401 && <a className="alert-link" href="/login">Sign in</a>}</div>;
  if (data === null) return <p role="status">Loading your workspace…</p>;
  return children(data);
}
