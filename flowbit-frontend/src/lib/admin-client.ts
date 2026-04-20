import { apiRequest } from "@/lib/api";
import { getStoredToken, type AuthUser } from "@/lib/auth-client";

export type ManagedUser = AuthUser;

export type AuditLogEntry = {
  id: number;
  user: number | null;
  username: string;
  action: string;
  timestamp: string;
  ip_address: string | null;
  target_model: string;
  target_id: string;
  details: string;
  changes: Record<string, unknown> | null;
};

export type AuditLogFilters = {
  action?: string;
  target_model?: string;
  target_id?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
};

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }

  return { Authorization: `Token ${token}` };
}

export async function fetchManagedUsers() {
  return apiRequest<ManagedUser[]>("/users/", {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function updateManagedUserRole(userId: number, role: string) {
  return apiRequest<{ message: string; user: ManagedUser }>(`/users/${userId}/set-role/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  });
}

export async function updateManagedUserOverride(userId: number, masterOverridePassword: string) {
  return apiRequest<{ message: string; user: ManagedUser }>(`/users/${userId}/set-master-override-password/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ master_override_password: masterOverridePassword }),
  });
}

export async function deleteManagedUser(userId: number) {
  return apiRequest<{ message: string }>(`/users/${userId}/`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function fetchAuditLogs(filters: AuditLogFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const queryString = params.toString();
  return apiRequest<AuditLogEntry[]>(`/audit-logs/${queryString ? `?${queryString}` : ""}`, {
    method: "GET",
    headers: authHeaders(),
  });
}
