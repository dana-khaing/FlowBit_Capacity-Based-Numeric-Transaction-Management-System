import { apiRequest, getApiBaseUrl } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitNotification = {
  id: number;
  category: "SYSTEM" | "ANNOUNCEMENT";
  level: "INFO" | "WARNING" | "IMPORTANT";
  title: string;
  message: string;
  action_href: string;
  created_by: number | null;
  created_by_display: string | null;
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

export const FLOWBIT_NOTIFICATIONS_UPDATED_EVENT = "flowbit:notifications-updated";

let notificationSocket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let socketListenerCount = 0;

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

export function dispatchNotificationsUpdated() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(FLOWBIT_NOTIFICATIONS_UPDATED_EVENT));
}

function getNotificationWebSocketUrl() {
  const token = getStoredToken();
  if (!token) {
    return null;
  }
  const baseUrl = getApiBaseUrl();
  const origin = baseUrl.replace(/\/api$/, "");
  const wsBase = origin.startsWith("https://")
    ? origin.replace(/^https:\/\//, "wss://")
    : origin.replace(/^http:\/\//, "ws://");
  return `${wsBase}/ws/notifications/?token=${encodeURIComponent(token)}`;
}

function connectNotificationSocket() {
  const socketUrl = getNotificationWebSocketUrl();
  if (!socketUrl || typeof window === "undefined") {
    return;
  }
  if (notificationSocket && (notificationSocket.readyState === WebSocket.OPEN || notificationSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  notificationSocket = new WebSocket(socketUrl);

  notificationSocket.onmessage = () => {
    dispatchNotificationsUpdated();
  };

  notificationSocket.onclose = () => {
    notificationSocket = null;
    if (socketListenerCount > 0) {
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectNotificationSocket();
      }, 2000);
    }
  };
}

export function startNotificationsLiveSync() {
  if (typeof window === "undefined") {
    return () => {};
  }

  socketListenerCount += 1;
  connectNotificationSocket();

  return () => {
    socketListenerCount = Math.max(0, socketListenerCount - 1);
    if (socketListenerCount === 0) {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      notificationSocket?.close();
      notificationSocket = null;
    }
  };
}
