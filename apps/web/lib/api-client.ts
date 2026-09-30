const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("channelbase_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("channelbase_token", token);
  else window.localStorage.removeItem("channelbase_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
    throw new ApiError(response.status, (body as { error?: string })?.error ?? response.statusText, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export function openEventStream(path: string, onMessage: (data: string) => void, onError?: () => void): () => void {
  const token = getToken();
  const url = new URL(`${API_URL}${path}`);
  // EventSource can't set custom headers, so for authenticated SSE endpoints we pass the token
  // as a query param; the API's auth plugin also checks ?token= as a fallback (see plugins/auth.ts).
  if (token) url.searchParams.set("token", token);
  const source = new EventSource(url.toString());
  source.onmessage = (event) => onMessage(event.data);
  source.onerror = () => {
    onError?.();
  };
  return () => source.close();
}
