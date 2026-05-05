import { apiRequest } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitOverflow = {
  id: number;
  transaction: number | null;
  ticket_number: string | null;
  customer_name: string | null;
  order_number: string | null;
  identifier_number: string;
  timestamp: string;
  excess_amount: string;
  status: "TCSO" | "CSO" | "OVRK" | "RFND";
  amount_to_approve: string | null;
  collaborators: number[];
  collaborator_names: string[];
  approved_at: string | null;
  helper_name: string;
  resolution_type: string;
  refunded_at: string | null;
  refund_amount: string | null;
};

export type FlowBitCollaborator = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  phone_number: string;
};

function authHeaders() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }
  return { Authorization: `Token ${token}` };
}

export async function fetchPendingOverflows(limit?: number) {
  const suffix = limit ? `?limit=${Math.min(limit, 20)}` : "";
  return apiRequest<FlowBitOverflow[]>(`/overflows/pending/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchApprovedOverflows(limit?: number) {
  const suffix = limit ? `?limit=${Math.min(limit, 20)}` : "";
  return apiRequest<FlowBitOverflow[]>(`/overflows/approved/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchOverkillOverflows(limit?: number) {
  const suffix = limit ? `?limit=${Math.min(limit, 20)}` : "";
  return apiRequest<FlowBitOverflow[]>(`/overflows/overkill/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function approveOverflow(payload: {
  overflowId: number;
  amountToApprove?: string;
  collaboratorIds?: number[];
}) {
  return apiRequest<{ message: string; overflow: FlowBitOverflow }>(`/overflows/${payload.overflowId}/approve/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      ...(payload.amountToApprove ? { amount_to_approve: payload.amountToApprove } : {}),
      collaborator_ids: payload.collaboratorIds ?? [],
    }),
  });
}

export async function resolveOverflowAction(payload: {
  overflowId: number;
  action: "refund_overflow_only" | "refund_transaction" | "refund_ticket";
  adminOverrideCode?: string;
}) {
  return apiRequest<{ message: string }>(`/overflows/${payload.overflowId}/resolve/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      action: payload.action,
      ...(payload.adminOverrideCode
        ? { admin_override_code: payload.adminOverrideCode }
        : {}),
    }),
  });
}

export async function fetchCollaborators() {
  return apiRequest<FlowBitCollaborator[]>("/collaborators/", {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function createCollaborator(payload: {
  username: string;
  full_name: string;
  email: string;
  phone_number: string;
}) {
  return apiRequest<FlowBitCollaborator>("/collaborators/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateCollaborator(
  collaboratorId: number,
  payload: {
    username: string;
    full_name: string;
    email: string;
    phone_number: string;
  },
) {
  return apiRequest<FlowBitCollaborator>(`/collaborators/${collaboratorId}/`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}
