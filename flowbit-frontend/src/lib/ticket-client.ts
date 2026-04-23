import { apiRequest } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitIdentifierOption = {
  id: number;
  number: string;
};

export type TicketManualAllocation = {
  ledger: number;
  amount: string;
};

export type AllocationPreview = {
  ledger_allocations: Array<{
    ledger_id: number;
    ledger_name: string;
    available_amount: string;
    requested_amount: string;
    allocated_amount: string;
    overflow_amount: string;
    fits: boolean;
  }>;
  reserve_available: string;
  reserve_allocated: string;
  overflow_amount: string;
  has_overflow: boolean;
};

export type TicketCreateItemPayload = {
  identifier: number;
  amount: string;
  allow_overflow: boolean;
  manual_allocations?: TicketManualAllocation[];
};

export type TicketCreatePayload = {
  customer_name: string;
  notes: string;
  items: TicketCreateItemPayload[];
};

export type TicketCreateResponse = {
  message?: string;
  detail?: string;
  ticket?: {
    id: number;
    ticket_number: string;
    customer_name: string;
    notes: string;
    created_at: string;
    total_amount: string;
    transaction_count: number;
  };
  transactions?: Array<{
    id: number;
    order_number: string;
    identifier: number;
    identifier_number: string;
    total_amount: string;
  }>;
  created?: Array<{
    id: number;
    order_number: string;
    identifier: string;
    amount: string;
    allocation_preview: AllocationPreview;
  }>;
  errors?: string[];
  ticket_id?: number;
  ticket_number?: string;
  total_amount?: string;
  transaction_count?: number;
};

function authHeaders() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }
  return { Authorization: `Token ${token}` };
}

export async function fetchIdentifierOptions() {
  return apiRequest<FlowBitIdentifierOption[]>("/identifiers/options/", {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function previewTicketItemAllocation(payload: {
  identifier: number;
  total_amount: string;
  manual_allocations?: TicketManualAllocation[];
}) {
  return apiRequest<AllocationPreview>("/transactions/allocation-preview/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function createTicket(payload: TicketCreatePayload) {
  return apiRequest<TicketCreateResponse>("/tickets/create-with-items/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}
