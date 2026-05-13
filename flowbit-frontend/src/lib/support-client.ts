import { apiRequest } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitSupportMessage = {
  id: number;
  sender: number;
  sender_username: string;
  sender_full_name: string;
  sender_role: string;
  is_admin_sender: boolean;
  body: string;
  created_at: string;
};

export type FlowBitSupportCase = {
  id: number;
  subject: string;
  status: "OPEN" | "CLOSED";
  created_by: number;
  created_by_username: string;
  created_by_full_name: string;
  created_by_role: string;
  closed_at: string | null;
  closed_by: number | null;
  closed_by_username: string | null;
  last_message_at: string | null;
  message_count: number;
  last_message_preview: string;
  created_at: string;
  updated_at: string;
};

export type FlowBitSupportCaseDetail = FlowBitSupportCase & {
  messages: FlowBitSupportMessage[];
};

function authHeaders() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }
  return { Authorization: `Token ${token}` };
}

export async function fetchSupportCases() {
  return apiRequest<FlowBitSupportCase[]>("/support-cases/", {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchSupportCase(caseId: number) {
  return apiRequest<FlowBitSupportCaseDetail>(`/support-cases/${caseId}/`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function createSupportCase(payload: { subject: string; message: string }) {
  return apiRequest<FlowBitSupportCase>("/support-cases/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function replyToSupportCase(caseId: number, message: string) {
  return apiRequest<FlowBitSupportCaseDetail>(`/support-cases/${caseId}/reply/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message }),
  });
}

export async function closeSupportCase(caseId: number) {
  return apiRequest<FlowBitSupportCaseDetail>(`/support-cases/${caseId}/close/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
}

export async function reopenSupportCase(caseId: number) {
  return apiRequest<FlowBitSupportCaseDetail>(`/support-cases/${caseId}/reopen/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
}
