import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY, clearAuthCookie } from "@/lib/auth";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api";

export function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

function isSessionAuthError(status: number, detail: string) {
  if (status !== 401 && status !== 403) {
    return false;
  }
  const normalizedDetail = detail.toLowerCase();
  return (
    normalizedDetail.includes("invalid token") ||
    normalizedDetail.includes("authentication credentials were not provided")
  );
}

function clearStaleClientSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  document.cookie = clearAuthCookie();
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
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
    if (isSessionAuthError(response.status, detail)) {
      clearStaleClientSession();
    }
    throw new Error(detail);
  }

  return data as T;
}
