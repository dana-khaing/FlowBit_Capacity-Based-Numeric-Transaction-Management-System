const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api";

export function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fieldError = Object.entries(data || {}).find(([, value]) => Array.isArray(value) && value.length > 0);
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : typeof data?.message === "string"
          ? data.message
          : fieldError
            ? String((fieldError[1] as unknown[])[0])
        : "Request failed.";
    throw new Error(detail);
  }

  return data as T;
}
