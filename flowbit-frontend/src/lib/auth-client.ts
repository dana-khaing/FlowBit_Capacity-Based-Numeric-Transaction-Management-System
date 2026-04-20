import {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  clearAuthCookie,
  createAuthCookie,
} from "@/lib/auth";
import { apiRequest, getApiBaseUrl } from "@/lib/api";

export type AuthUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  role: string;
  phone_number: string;
  avatar_url: string | null;
  has_override_code: boolean;
  last_activity: string | null;
  last_login: string | null;
  date_joined: string;
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

type RegisterPayload = {
  full_name: string;
  username: string;
  email: string;
  phone_number: string;
  password: string;
  confirm_password: string;
};

type PasswordResetPayload = {
  selector: string;
  token: string;
  new_password: string;
};

type ProfileUpdatePayload = {
  full_name: string;
  username: string;
  email: string;
  phone_number: string;
};

type AccountDeletionPayload = {
  admin_override_code?: string;
};

function setStoredSession(token: string, user: AuthUser, remember: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  document.cookie = createAuthCookie(token, remember);
}

export function clearStoredSession() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    document.cookie = clearAuthCookie();
  }
}

export function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Token ${token}` } : {};
}

export async function loginWithPassword(payload: { username: string; password: string; remember: boolean }) {
  const { remember, ...body } = payload;
  const response = await apiRequest<LoginResponse>("/auth/login/", {
    method: "POST",
    body: JSON.stringify(body),
  });
  setStoredSession(response.token, response.user, remember);
  return response;
}

export async function loginWithGoogle(payload: { idToken: string; remember: boolean }) {
  const { remember, idToken } = payload;
  const response = await apiRequest<LoginResponse>("/auth/google/", {
    method: "POST",
    body: JSON.stringify({ id_token: idToken }),
  });
  setStoredSession(response.token, response.user, remember);
  return response;
}

export async function registerAccount(payload: RegisterPayload) {
  return apiRequest<{ message: string; user: AuthUser }>("/auth/register/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function requestPasswordReset(email: string) {
  return apiRequest<{ message: string }>("/auth/forgot-password/", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(payload: PasswordResetPayload, remember = false) {
  const response = await apiRequest<LoginResponse & { message: string }>("/auth/reset-password/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setStoredSession(response.token, response.user, remember);
  return response;
}

export async function changePassword(payload: { current_password: string; new_password: string }) {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }

  const response = await apiRequest<{ message: string; token: string }>("/auth/change-password/", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token);
  }

  return response;
}

export async function fetchCurrentUser() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }

  const response = await apiRequest<{ user: AuthUser }>("/auth/me/", {
    method: "GET",
    headers: authHeaders(token),
  });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(response.user));
  }
  return response.user;
}

export async function updateCurrentUserProfile(payload: ProfileUpdatePayload) {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }

  const response = await apiRequest<{ user: AuthUser }>("/auth/me/", {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(response.user));
  }

  return response.user;
}

export async function deleteCurrentUserAccount(payload: AccountDeletionPayload) {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }

  return apiRequest<{ message: string }>("/auth/me/", {
    method: "DELETE",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function uploadProfileAvatar(file: File) {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }

  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch(`${getApiBaseUrl()}/auth/avatar/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : "Avatar upload failed.");
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(data.user));
  }

  return data.user as AuthUser;
}

export async function logoutFromBackend() {
  const token = getStoredToken();
  if (token) {
    try {
      await apiRequest<{ message: string }>("/auth/logout/", {
        method: "POST",
        headers: authHeaders(token),
      });
    } catch {
      // Ignore logout failures and clear the local session anyway.
    }
  }
  clearStoredSession();
}
