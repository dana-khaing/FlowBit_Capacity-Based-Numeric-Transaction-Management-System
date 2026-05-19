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
  identifier: number;
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

type RepeatTicketGenerateResponse = {
  repeat_ticket_id: number;
  status: "GENERATED" | "UNSUCCESSFUL" | "UPDATED";
  ticket_id?: number;
  ticket_number?: string;
  detail?: string;
  errors?: string[];
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

export async function generateRepeatTicket(id: number) {
  return apiRequest<RepeatTicketGenerateResponse>(`/repeat-tickets/${id}/generate/`, {
    method: "POST",
    headers: authHeaders(),
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
