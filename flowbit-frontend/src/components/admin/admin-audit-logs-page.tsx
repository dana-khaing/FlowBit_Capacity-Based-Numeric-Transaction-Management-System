"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { AdminAccessGuard } from "@/components/admin/admin-access-guard";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchAuditLogs, type AuditLogEntry } from "@/lib/admin-client";

type AuditFilters = {
  action: string;
  target_model: string;
  target_id: string;
  related_ticket_number: string;
  user_id: string;
  date_from: string;
  date_to: string;
};

const initialFilters: AuditFilters = {
  action: "",
  target_model: "",
  target_id: "",
  related_ticket_number: "",
  user_id: "",
  date_from: "",
  date_to: "",
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export function AdminAuditLogsPage() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<AuditFilters>(initialFilters);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadLogs(nextFilters: AuditFilters) {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await fetchAuditLogs(nextFilters);
      setLogs(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Audit log request failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const nextFilters = {
      action: searchParams.get("action") || "",
      target_model: searchParams.get("target_model") || "",
      target_id: searchParams.get("target_id") || "",
      related_ticket_number: searchParams.get("related_ticket_number") || "",
      user_id: searchParams.get("user_id") || "",
      date_from: searchParams.get("date_from") || "",
      date_to: searchParams.get("date_to") || "",
    };
    setFilters(nextFilters);
    loadLogs(nextFilters);
  }, [searchParams]);

  const hasActiveFilters = useMemo(() => Object.values(filters).some(Boolean), [filters]);

  function updateFilter<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <AdminAccessGuard>
      {() => (
        <WorkspaceShell>
          <div className="mx-auto w-full max-w-[1800px] px-4 py-2 sm:px-6 lg:px-8 lg:py-5">
            <AdminPageHeader
              eyebrow="Admin"
              title="Audit logs"
              description="Review sensitive operations, account changes, and override activity across the workspace."
            />

            <section className="mt-5 rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Input
                  value={filters.action}
                  onChange={(event) => updateFilter("action", event.target.value)}
                  placeholder="Action"
                  aria-label="Filter by action"
                />
                <Input
                  value={filters.target_model}
                  onChange={(event) => updateFilter("target_model", event.target.value)}
                  placeholder="Target model"
                  aria-label="Filter by target model"
                />
                <Input
                  value={filters.target_id}
                  onChange={(event) => updateFilter("target_id", event.target.value)}
                  placeholder="Target id"
                  aria-label="Filter by target id"
                />
                <Input
                  value={filters.user_id}
                  onChange={(event) => updateFilter("user_id", event.target.value)}
                  placeholder="User id"
                  aria-label="Filter by user id"
                />
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input
                  type="date"
                  value={filters.date_from}
                  onChange={(event) => updateFilter("date_from", event.target.value)}
                  aria-label="Filter from date"
                />
                <Input
                  type="date"
                  value={filters.date_to}
                  onChange={(event) => updateFilter("date_to", event.target.value)}
                  aria-label="Filter to date"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => loadLogs(filters)} disabled={loading}>
                  {loading ? "Loading..." : "Apply filters"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilters(initialFilters);
                    loadLogs(initialFilters);
                  }}
                  disabled={loading || !hasActiveFilters}
                >
                  Clear
                </Button>
              </div>

              {errorMessage ? <p className="mt-4 text-sm font-medium text-rose-700">{errorMessage}</p> : null}

              <div className="mt-5 grid gap-4">
                {logs.map((log) => (
                  <article
                    key={log.id}
                    className="rounded-[24px] border border-stone-900/8 bg-[#f8f6f2] p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-base font-semibold text-stone-950">{log.action}</p>
                        <p className="mt-1 text-sm text-stone-500">{log.details}</p>
                      </div>
                      <p className="text-xs uppercase tracking-[0.16em] text-stone-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">User</p>
                        <p className="mt-1 text-sm text-stone-800">{formatValue(log.username)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Target</p>
                        <p className="mt-1 text-sm text-stone-800">
                          {formatValue(log.target_model)} #{formatValue(log.target_id)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">IP address</p>
                        <p className="mt-1 text-sm text-stone-800">{formatValue(log.ip_address)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Changes</p>
                        <p className="mt-1 break-words text-sm text-stone-800">{formatValue(log.changes)}</p>
                      </div>
                    </div>
                  </article>
                ))}

                {!loading && !logs.length ? (
                  <div className="rounded-[24px] border border-dashed border-stone-900/12 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                    No audit entries matched the current filters.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </WorkspaceShell>
      )}
    </AdminAccessGuard>
  );
}
