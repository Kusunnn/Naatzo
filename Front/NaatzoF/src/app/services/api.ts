const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:4000/api";

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}
export class ApiError extends Error {
  constructor(message: string, public status: number) {super(message);}
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  const multipart = body instanceof FormData;
  if (!multipart) requestHeaders.set('Content-Type', 'application/json');
  const token = sessionStorage.getItem('naatzo-token');
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: requestHeaders,
    body: multipart ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const errorPayload = (await response.json()) as { error?: string };
      if (errorPayload?.error) {
        message = errorPayload.error;
      }
    } catch {
      // Keep default message when body is not json.
    }
    throw new ApiError(message,response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export { API_BASE_URL };
