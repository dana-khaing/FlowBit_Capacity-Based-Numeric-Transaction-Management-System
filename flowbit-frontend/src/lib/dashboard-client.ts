import { apiRequest } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitDashboardReport = {
  period: {
    id: number;
    name: string;
    is_open: boolean;
    start_date: string;
    end_date: string;
  } | null;
  ledger_count: number;
  active_ledger_count: number;
  ticket_count: number;
  transaction_count: number;
  today_ticket_count: number;
  identifier_count: number;
  total_transaction_amount: string;
  total_allocated_amount: string;
  standard_total_capacity: string;
  standard_total_allocated_amount: string;
  pending_overflow_count: number;
  pending_overflow_amount: string;
  approved_overflow_count: number;
  approved_overflow_amount: string;
  refunded_overflow_count: number;
  refunded_overflow_amount: string;
  reserve_capacity_granted: string;
  hot_numbers: Array<{
    identifier: string;
    amount: string;
    progress: number;
  }>;
  almost_full: Array<{
    identifier: string;
    remaining: string;
    progress: number;
    tone: "critical" | "warning";
  }>;
  full_numbers: Array<{
    identifier: string;
    amount: string;
  }>;
};

export type FlowBitIdentifierCapacityRow = {
  id: number;
  number: string;
  total_capacity: string;
  normal_usage: string;
  reserve_granted: string;
  reserve_used: string;
  remaining_capacity: string;
  pending_overflow_amount: string;
  approved_overflow_amount: string;
  refunded_overflow_amount: string;
};

export type FlowBitIdentifierCapacityReport = {
  period: {
    id: number;
    name: string;
  } | null;
  count: number;
  results: FlowBitIdentifierCapacityRow[];
};

export type FlowBitDashboardFullNumberPage = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: Array<{
    identifier: string;
    amount: string;
  }>;
};

function authHeaders() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }
  return { Authorization: `Token ${token}` };
}

export async function fetchDashboardReport(periodId?: number) {
  const query = new URLSearchParams();
  if (periodId) {
    query.set("period_id", String(periodId));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<FlowBitDashboardReport>(`/reports/dashboard/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchIdentifierCapacityReport(periodId?: number) {
  const query = new URLSearchParams();
  if (periodId) {
    query.set("period_id", String(periodId));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<FlowBitIdentifierCapacityReport>(`/reports/identifiers/capacity/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchDashboardFullNumbers(filters?: {
  periodId?: number;
  page?: number;
  identifier?: string;
}) {
  const query = new URLSearchParams();
  if (filters?.periodId) {
    query.set("period_id", String(filters.periodId));
  }
  if (filters?.page) {
    query.set("page", String(filters.page));
  }
  if (filters?.identifier?.trim()) {
    query.set("identifier", filters.identifier.trim());
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<FlowBitDashboardFullNumberPage>(`/reports/dashboard/full-numbers/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}
