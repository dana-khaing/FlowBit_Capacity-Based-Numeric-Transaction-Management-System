import { apiRequest, getApiBaseUrl } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitPeriod = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  close_time?: string | null;
  is_open: boolean;
};

type CurrentPeriodResponse = FlowBitPeriod;

function authHeaders() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }
  return { Authorization: `Token ${token}` };
}

export async function fetchPeriods() {
  return apiRequest<FlowBitPeriod[]>("/periods/", {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchCurrentPeriod() {
  const response = await fetch(`${getApiBaseUrl()}/periods/current/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
  });

  if (response.status === 404) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : "Request failed.");
  }

  return data as CurrentPeriodResponse;
}

export async function createPeriod(payload: {
  name: string;
  start_date: string;
  end_date: string;
  close_time: string;
  is_open?: boolean;
}) {
  return apiRequest<FlowBitPeriod>("/periods/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      ...payload,
      is_open: payload.is_open ?? true,
    }),
  });
}
