export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: 'customer' | 'product_manager';
  organization_id: number | null;
  organization_name: string | null;
};
export type Session = { user: AuthUser | null; csrfToken: string };

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: Record<string, string> = {}) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error ?? 'The request could not be completed.', response.status, body.fields);
  return body as T;
}
