import { apiRequest } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitRepeatTicketItem = {
  id: number;
  identifier: number;
  identifier_number: string;
  amount: string;
  amount_uses_allocation_basis: boolean;
  use_permutations: boolean;
  position: number;
};

export type FlowBitRepeatTicket = {
  id: number;
  repeat_code: string | null;
  customer_name: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  current_status: "NEW" | "GENERATED" | "UPDATED" | "UNSUCCESSFUL";
  generated_ticket_id: number | null;
  generated_ticket_number: string | null;
  generation_error: string | null;
  item_count: number;
  total_amount: string;
  items: FlowBitRepeatTicketItem[];
};

export type RepeatTicketDraftItemPayload = {
  identifier?: number;
  identifier_number?: string;
  amount: string;
  amount_uses_allocation_basis: boolean;
  use_permutations: boolean;
  position: number;
};

export type RepeatTicketPayload = {
  customer_name: string;
  notes?: string;
  items: RepeatTicketDraftItemPayload[];
};

export type RepeatTicketGenerateResponse = {
  repeat_ticket_id: number;
  status: "GENERATED" | "UNSUCCESSFUL" | "UPDATED" | "CONFIRM_REQUIRED";
  ticket_id?: number;
  ticket_number?: string;
  detail?: string;
  errors?: string[];
  overflow_items?: Array<{
    identifier_number: string;
    overflow_amount: string;
  }>;
  total_overflow_amount?: string;
};

function authHeaders() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }
  return { Authorization: `Token ${token}` };
}

export async function fetchRepeatTickets() {
  return apiRequest<FlowBitRepeatTicket[]>("/repeat-tickets/", {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function createRepeatTicket(payload: RepeatTicketPayload) {
  return apiRequest<FlowBitRepeatTicket>("/repeat-tickets/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateRepeatTicket(id: number, payload: RepeatTicketPayload) {
  return apiRequest<FlowBitRepeatTicket>(`/repeat-tickets/${id}/`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function deleteRepeatTicket(id: number) {
  return apiRequest<void>(`/repeat-tickets/${id}/`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function generateRepeatTicket(id: number, payload?: { confirm_spill_over?: boolean }) {
  return apiRequest<RepeatTicketGenerateResponse>(`/repeat-tickets/${id}/generate/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload ?? {}),
  });
}

export async function generateAllRepeatTickets() {
  return apiRequest<{
    generated: RepeatTicketGenerateResponse[];
    unsuccessful: RepeatTicketGenerateResponse[];
    skipped: Array<{ repeat_ticket_id: number; status: "GENERATED" | "UPDATED" }>;
  }>("/repeat-tickets/generate-all/", {
    method: "POST",
    headers: authHeaders(),
  });
}
