import { apiRequest } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitNotification = {
  id: number;
  category: "SYSTEM" | "ANNOUNCEMENT";
  level: "INFO" | "WARNING" | "IMPORTANT";
  title: string;
  message: string;
  action_href: string;
  created_by: number | null;
  created_by_username: string | null;
  period: number | null;
  period_name: string | null;
  read_at: string | null;
  is_read: boolean;
  created_at: string;
};

export type FlowBitNotificationSummary = {
  unread_count: number;
  recent: FlowBitNotification[];
};

function authHeaders() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }
  return { Authorization: `Token ${token}` };
}

export async function fetchNotificationSummary() {
  return apiRequest<FlowBitNotificationSummary>("/notifications/summary/", {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchNotifications(filters?: { unreadOnly?: boolean }) {
  const query = new URLSearchParams();
  if (filters?.unreadOnly) {
    query.set("unread_only", "true");
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<FlowBitNotification[]>(`/notifications/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function markNotificationRead(notificationId: number) {
  return apiRequest<FlowBitNotification>(`/notifications/${notificationId}/mark-read/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
}

export async function markAllNotificationsRead() {
  return apiRequest<{ message: string; updated_count: number }>("/notifications/mark-all-read/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
}

export async function broadcastNotification(payload: {
  title: string;
  message: string;
  level: "INFO" | "WARNING" | "IMPORTANT";
  action_href?: string;
}) {
  return apiRequest<{ message: string; recipient_count: number }>("/notifications/broadcast/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}
