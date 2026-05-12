import { apiRequest, getApiBaseUrl } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitPeriod = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  close_time?: string | null;
  is_open: boolean;
  lucky_draw_display?: string;
  lucky_draw_revealed?: boolean;
  lucky_draw_announced_at?: string | null;
};

export type FlowBitLuckyDraw = {
  id?: number | null;
  period: number;
  period_name: string;
  number: string | null;
  display_number: string;
  winning_identifiers: string[];
  announced_by: number | null;
  announced_by_username: string | null;
  announced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type FlowBitLuckyDrawWinners = {
  lucky_draw: FlowBitLuckyDraw;
  tickets: Array<{
    ticket_number: string;
    customer_name: string;
    created_at: string;
    matched_identifiers: string[];
    transaction_count: number;
    total_amount: string;
  }>;
  approved_overflows: Array<{
    id: number;
    identifier_number: string;
    ticket_number: string | null;
    amount: string;
    approved_at: string | null;
    collaborator_names: string[];
  }>;
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

export async function updatePeriod(
  periodId: number,
  payload: {
    end_date: string;
    close_time: string;
    admin_override_code?: string;
  },
) {
  return apiRequest<FlowBitPeriod>(`/periods/${periodId}/`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function closePeriod(periodId: number, adminOverrideCode?: string) {
  return apiRequest<{ message: string; period: FlowBitPeriod; closed_ledgers: number }>(`/periods/${periodId}/close/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(adminOverrideCode ? { admin_override_code: adminOverrideCode } : {}),
  });
}

export async function reopenPeriod(
  periodId: number,
  payload: {
    end_date: string;
    close_time: string;
    adminOverrideCode?: string;
  },
) {
  return apiRequest<{ message: string; period: FlowBitPeriod; reactivated_ledgers: number }>(`/periods/${periodId}/reopen/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      end_date: payload.end_date,
      close_time: payload.close_time,
      ...(payload.adminOverrideCode ? { admin_override_code: payload.adminOverrideCode } : {}),
    }),
  });
}

export async function deletePeriod(periodId: number, adminOverrideCode?: string) {
  return apiRequest<{ detail?: string }>(`/periods/${periodId}/`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify(adminOverrideCode ? { admin_override_code: adminOverrideCode } : {}),
  });
}

export async function fetchPeriodLuckyDraw(periodId: number) {
  return apiRequest<FlowBitLuckyDraw>(`/periods/${periodId}/lucky-draw/`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function savePeriodLuckyDraw(periodId: number, number: string) {
  return apiRequest<FlowBitLuckyDraw>(`/periods/${periodId}/lucky-draw/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ number }),
  });
}

export async function deletePeriodLuckyDraw(periodId: number) {
  return apiRequest<void>(`/periods/${periodId}/lucky-draw/`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function fetchPeriodLuckyDrawWinners(periodId: number) {
  return apiRequest<FlowBitLuckyDrawWinners>(`/periods/${periodId}/lucky-draw-winners/`, {
    method: "GET",
    headers: authHeaders(),
  });
}
