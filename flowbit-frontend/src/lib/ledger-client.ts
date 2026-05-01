import { apiRequest, getApiBaseUrl } from "@/lib/api";
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
  is_capacity_reserve: boolean;
  closed_at: string | null;
  created_at: string;
};

export type FlowBitLedgerRecording = {
  allocation_id: number;
  amount: string;
  display_amount: string;
  order_number: string;
  ticket_number: string | null;
  transaction_id: number;
  created_at: string;
};

export type FlowBitLedgerIdentifierRow = {
  identifier_id: number;
  number: string;
  recording_display: string;
  recordings: FlowBitLedgerRecording[];
  allocated_amount: string;
  remaining_capacity: string;
  is_full: boolean;
  is_frozen: boolean;
  frozen_all_ledgers: boolean;
  frozen_ledger_ids: number[];
  full_ledger_ids: number[];
};

export type FlowBitLedgerView = {
  ledger: FlowBitLedger;
  summary: {
    identifier_count: number;
    used_identifier_count: number;
    capacity_per_identifier: string;
    total_capacity: string;
    allocated_total: string;
    remaining_capacity: string;
  };
  identifiers: FlowBitLedgerIdentifierRow[];
};

function authHeaders() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No session found.");
  }
  return { Authorization: `Token ${token}` };
}

async function downloadLedgerAsset(path: string, filenameFallback: string) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    let detail = "Request failed.";
    try {
      const data = await response.json();
      detail =
        typeof data?.detail === "string"
          ? data.detail
          : typeof data?.message === "string"
            ? data.message
            : detail;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(detail);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("Content-Disposition") || "";
  const matchedFilename = contentDisposition.match(/filename=\"?([^"]+)\"?/i)?.[1];
  return {
    blob,
    filename: matchedFilename || filenameFallback,
  };
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

export async function fetchLedgerView(ledgerId: number) {
  return apiRequest<FlowBitLedgerView>(`/ledgers/${ledgerId}/view/`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function exportLedgerCsv(ledgerId: number) {
  return downloadLedgerAsset(`/ledgers/${ledgerId}/export-csv/`, `ledger-${ledgerId}.csv`);
}

export async function exportLedgerPdf(ledgerId: number) {
  return downloadLedgerAsset(`/ledgers/${ledgerId}/export-pdf/`, `ledger-${ledgerId}.pdf`);
}

export async function freezeIdentifier(payload: {
  identifierId: number;
  scope: "all" | "ledger";
  ledgerId?: number;
}) {
  return apiRequest<{ message: string }>(`/identifiers/${payload.identifierId}/freeze/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      scope: payload.scope,
      ...(payload.ledgerId ? { ledger_id: payload.ledgerId } : {}),
    }),
  });
}

export async function unfreezeIdentifier(payload: {
  identifierId: number;
  scope: "all" | "ledger";
  ledgerId?: number;
}) {
  return apiRequest<{ message: string }>(`/identifiers/${payload.identifierId}/unfreeze/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      scope: payload.scope,
      ...(payload.ledgerId ? { ledger_id: payload.ledgerId } : {}),
    }),
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

export async function deleteLedger(ledgerId: number, adminOverrideCode?: string) {
  return apiRequest<void>(`/ledgers/${ledgerId}/`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify(adminOverrideCode ? { admin_override_code: adminOverrideCode } : {}),
  });
}

export async function closeLedger(ledgerId: number, adminOverrideCode?: string) {
  return apiRequest<{ message: string; ledger: FlowBitLedger }>(`/ledgers/${ledgerId}/close/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(adminOverrideCode ? { admin_override_code: adminOverrideCode } : {}),
  });
}

export async function reopenLedger(ledgerId: number, adminOverrideCode?: string) {
  return apiRequest<{ message: string; ledger: FlowBitLedger }>(`/ledgers/${ledgerId}/reopen/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(adminOverrideCode ? { admin_override_code: adminOverrideCode } : {}),
  });
}

export async function updateLedger(
  ledgerId: number,
  payload: {
    close_time: string;
    admin_override_code?: string;
  },
) {
  return apiRequest<FlowBitLedger>(`/ledgers/${ledgerId}/`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
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
