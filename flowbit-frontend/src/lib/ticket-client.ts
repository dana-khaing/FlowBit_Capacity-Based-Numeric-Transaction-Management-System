import { apiRequest } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitIdentifierOption = {
  id: number;
  number: string;
};

export type FlowBitIdentifierCapacity = {
  id: number;
  number: string;
  remaining_capacity: string;
  is_frozen_all_ledgers: boolean;
  freeze_status: "none" | "partial" | "all";
  ledger_capacity_rows: Array<{
    ledger_id: number;
    ledger_name: string;
    priority: number;
    is_capacity_reserve: boolean;
    total_capacity: string;
    allocated_amount: string;
    remaining_capacity: string;
    is_frozen: boolean;
    is_full: boolean;
  }>;
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
  notes?: string;
  items: TicketCreateItemPayload[];
};

export type TicketCreateResponse = {
  message?: string;
  detail?: string;
  ticket?: {
    id: number;
    ticket_number: string;
    customer_name: string;
    notes?: string;
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

export type FlowBitTicketListItem = {
  id: number;
  ticket_number: string;
  created_at: string;
  customer_name: string;
  is_refunded: boolean;
  refunded_at: string | null;
  has_spill_over: boolean;
  active_spill_over_count: number;
  refunded_spill_over_count: number;
  refunded_transaction_count: number;
  total_amount: string;
  transaction_count: number;
  identifier_numbers: string[];
};

export type FlowBitTicketDetail = FlowBitTicketListItem & {
  created_by: number | null;
  created_by_username: string | null;
  notes?: string | null;
  is_refunded: boolean;
  refunded_at: string | null;
  transactions: Array<{
    id: number;
    ticket: number | null;
    ticket_id?: number | null;
    ticket_number: string | null;
    identifier: number;
    identifier_number: string;
    total_amount: string;
    timestamp: string;
    order_number: string;
    created_by: number | null;
    is_refunded: boolean;
    refunded_at: string | null;
    allocations: Array<{
      id: number;
      ledger: number;
      ledger_name: string;
      amount?: string;
      amount_allocated?: string;
    }>;
    overflows: Array<{
      id: number;
      excess_amount?: string;
      amount_to_approve: string;
      refund_amount?: string | null;
      approved_at: string | null;
      status: string;
      resolution_type?: string | null;
      collaborator_names?: string[];
    }>;
  }>;
};

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

export async function resolveTicketRefundAction(payload: {
  ticketNumber: string;
  action: "refund_ticket" | "refund_transaction";
  transactionId?: number;
  adminOverrideCode?: string;
}) {
  return apiRequest<{ message: string }>(`/tickets/${payload.ticketNumber}/refund/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      action: payload.action,
      ...(payload.transactionId ? { transaction_id: payload.transactionId } : {}),
      ...(payload.adminOverrideCode
        ? { admin_override_code: payload.adminOverrideCode }
        : {}),
    }),
  });
}

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

export async function fetchIdentifierCapacity(identifierId: number) {
  return apiRequest<FlowBitIdentifierCapacity>(`/identifiers/${identifierId}/`, {
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

export async function fetchTickets(filters?: {
  periodId?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (filters?.periodId) {
    query.set("period_id", String(filters.periodId));
  }
  if (filters?.limit) {
    query.set("limit", String(filters.limit));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<FlowBitTicketListItem[]>(`/tickets/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchTicketDetail(ticketNumber: string) {
  return apiRequest<FlowBitTicketDetail>(`/tickets/${ticketNumber}/`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function downloadTicketReceiptPdf(ticketNumbers: string[]) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api"}/tickets/receipt-pdf/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ ticket_numbers: ticketNumbers }),
  });

  if (!response.ok) {
    let message = "Request failed.";
    try {
      const data = await response.json();
      message = data.detail || data.message || message;
    } catch {}
    throw new Error(message);
  }

  return response.blob();
}
