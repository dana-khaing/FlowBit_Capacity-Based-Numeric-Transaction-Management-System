import { apiRequest } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-client";

export type FlowBitLedger = {
  id: number;
  period: number | null;
  period_name: string | null;
  name: string;
  end_date: string;
  limit_per_identifier: string;
  priority: number;
  is_active: boolean;
  closed_at: string | null;
  created_at: string;
};

function authHeaders() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }
  return { Authorization: `Token ${token}` };
}

export async function fetchLedgers(params?: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });

  const path = search.size ? `/ledgers/?${search.toString()}` : "/ledgers/";
  return apiRequest<FlowBitLedger[]>(path, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function createLedger(payload: {
  period: number;
  name: string;
  limit_per_identifier: string;
  priority: number;
  close_time: string;
  admin_override_code?: string;
}) {
  return apiRequest<FlowBitLedger>("/ledgers/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function closeLedger(ledgerId: number, adminOverrideCode?: string) {
  return apiRequest<{ message: string; ledger: FlowBitLedger }>(`/ledgers/${ledgerId}/close/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(adminOverrideCode ? { admin_override_code: adminOverrideCode } : {}),
  });
}

export async function reorderLedgerPriorities(
  ledgerPriorities: Array<{ id: number; priority: number }>,
  adminOverrideCode?: string,
) {
  return apiRequest<{ message: string; ledgers: Array<{ id: number; name: string; priority: number }> }>(
    "/ledgers/reorder-priorities/",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        ledger_priorities: ledgerPriorities,
        ...(adminOverrideCode ? { admin_override_code: adminOverrideCode } : {}),
      }),
    },
  );
}
