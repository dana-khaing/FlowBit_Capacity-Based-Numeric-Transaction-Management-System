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
  identifier_count: number;
  total_transaction_amount: string;
  total_allocated_amount: string;
  pending_overflow_count: number;
  pending_overflow_amount: string;
  approved_overflow_count: number;
  approved_overflow_amount: string;
  refunded_overflow_count: number;
  refunded_overflow_amount: string;
  reserve_capacity_granted: string;
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
