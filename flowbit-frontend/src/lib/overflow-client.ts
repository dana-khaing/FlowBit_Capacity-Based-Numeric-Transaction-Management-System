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

export type FlowBitOverflowPage = {
  results: FlowBitOverflow[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: {
    count: number;
    total_amount: string;
  };
};

function buildOverflowQuery(filters?: { limit?: number; periodId?: number }) {
  const search = new URLSearchParams();
  if (filters?.limit) {
    search.set("limit", String(Math.min(filters.limit, 20)));
  }
  if (filters?.periodId) {
    search.set("period_id", String(filters.periodId));
  }
  return search.toString() ? `?${search.toString()}` : "";
}

export type FlowBitCollaborator = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  phone_number: string;
};

export type FlowBitSpillOverExportPreview = {
  collaborator_label: string;
  period_label: string;
  summary: {
    identifier_count: number;
    approved_total: string;
    overkill_total: string;
    total_amount: string;
  };
  rows: Array<{
    identifier_number: string;
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

async function downloadOverflowAsset(path: string, filenameFallback: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api"}${path}`, {
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

export async function fetchPendingOverflows(filters?: { limit?: number; periodId?: number }) {
  const suffix = buildOverflowQuery(filters);
  return apiRequest<FlowBitOverflow[]>(`/overflows/pending/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchPendingOverflowPage(filters?: {
  periodId?: number;
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const search = new URLSearchParams();
  if (filters?.periodId) {
    search.set("period_id", String(filters.periodId));
  }
  search.set("page", String(filters?.page ?? 1));
  search.set("page_size", String(Math.min(filters?.pageSize ?? 20, 20)));
  if (filters?.search?.trim()) {
    search.set("search", filters.search.trim());
  }
  return apiRequest<FlowBitOverflowPage>(`/overflows/pending/?${search.toString()}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchApprovedOverflows(filters?: { limit?: number; periodId?: number }) {
  const suffix = buildOverflowQuery(filters);
  return apiRequest<FlowBitOverflow[]>(`/overflows/approved/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchApprovedOverflowPage(filters?: {
  periodId?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  ticketNumber?: string;
  customerName?: string;
  identifierNumber?: string;
  collaboratorName?: string;
}) {
  const search = new URLSearchParams();
  if (filters?.periodId) {
    search.set("period_id", String(filters.periodId));
  }
  search.set("page", String(filters?.page ?? 1));
  search.set("page_size", String(Math.min(filters?.pageSize ?? 20, 20)));
  if (filters?.search?.trim()) {
    search.set("search", filters.search.trim());
  }
  if (filters?.ticketNumber?.trim()) {
    search.set("ticket_number", filters.ticketNumber.trim());
  }
  if (filters?.customerName?.trim()) {
    search.set("customer_name", filters.customerName.trim());
  }
  if (filters?.identifierNumber?.trim()) {
    search.set("identifier_number", filters.identifierNumber.trim());
  }
  if (filters?.collaboratorName?.trim()) {
    search.set("collaborator_name", filters.collaboratorName.trim());
  }
  return apiRequest<FlowBitOverflowPage>(`/overflows/approved/?${search.toString()}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchOverkillOverflows(filters?: { limit?: number; periodId?: number }) {
  const suffix = buildOverflowQuery(filters);
  return apiRequest<FlowBitOverflow[]>(`/overflows/overkill/${suffix}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function fetchOverkillOverflowPage(filters?: {
  periodId?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  collaboratorName?: string;
}) {
  const search = new URLSearchParams();
  if (filters?.periodId) {
    search.set("period_id", String(filters.periodId));
  }
  search.set("page", String(filters?.page ?? 1));
  search.set("page_size", String(Math.min(filters?.pageSize ?? 20, 20)));
  if (filters?.search?.trim()) {
    search.set("search", filters.search.trim());
  }
  if (filters?.collaboratorName?.trim()) {
    search.set("collaborator_name", filters.collaboratorName.trim());
  }
  return apiRequest<FlowBitOverflowPage>(`/overflows/overkill/?${search.toString()}`, {
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

export async function createDirectOverkill(payload: {
  identifier: number;
  amount: string;
  collaboratorIds: number[];
}) {
  return apiRequest<{ message: string; overflow: FlowBitOverflow }>("/overflows/overkill/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      identifier: payload.identifier,
      amount: payload.amount,
      collaborator_ids: payload.collaboratorIds,
    }),
  });
}

export async function fetchSpillOverExportPreview(filters?: {
  periodId?: number;
  collaboratorId?: string;
}) {
  const search = new URLSearchParams();
  if (filters?.periodId) {
    search.set("period_id", String(filters.periodId));
  }
  if (filters?.collaboratorId) {
    search.set("collaborator_id", filters.collaboratorId);
  }
  return apiRequest<FlowBitSpillOverExportPreview>(`/collaborators/spill-over-export/?${search.toString()}`, {
    method: "GET",
    headers: authHeaders(),
  });
}

export async function downloadSpillOverExportPdf(filters?: {
  periodId?: number;
  collaboratorId?: string;
}) {
  const search = new URLSearchParams();
  if (filters?.periodId) {
    search.set("period_id", String(filters.periodId));
  }
  if (filters?.collaboratorId) {
    search.set("collaborator_id", filters.collaboratorId);
  }
  return downloadOverflowAsset(
    `/collaborators/spill-over-export-pdf/?${search.toString()}`,
    "spill_over_export.pdf",
  );
}
