"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faClock,
  faLayerGroup,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { TicketReceiptCard } from "@/components/tickets/ticket-receipt-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePeriodState } from "@/components/period/use-period-state";
import { fetchTicketDetail, type FlowBitTicketDetail } from "@/lib/ticket-client";
import {
  fetchLedgerView,
  fetchLedgers,
  type FlowBitLedger,
  type FlowBitLedgerView,
} from "@/lib/ledger-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCompactAmount(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }
  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

type LedgerViewPageProps = {
  ledgerId: number;
};

const IDENTIFIERS_PER_PAGE = 100;

export function LedgerViewPage({ ledgerId }: LedgerViewPageProps) {
  const [toast, setToast] = useState<ToastState>(null);
  const [ledgerOptions, setLedgerOptions] = useState<FlowBitLedger[]>([]);
  const [ledgerView, setLedgerView] = useState<FlowBitLedgerView | null>(null);
  const [selectedView, setSelectedView] = useState<string>(String(ledgerId));
  const [ledgerViewSearch, setLedgerViewSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTicketDetail, setSelectedTicketDetail] = useState<FlowBitTicketDetail | null>(null);
  const [isTicketViewLoading, setIsTicketViewLoading] = useState(false);
  const { activePeriod } = usePeriodState();

  useEffect(() => {
    let isActive = true;

    async function loadLedgerView() {
      setIsLoading(true);
      setPageError(null);

      try {
        const [availableLedgers, detail] = await Promise.all([
          activePeriod ? fetchLedgers({ period_id: activePeriod.id }) : Promise.resolve([]),
          fetchLedgerView(ledgerId),
        ]);
        if (!isActive) {
          return;
        }
        setLedgerOptions(availableLedgers.filter((ledger) => ledger.is_active));
        setLedgerView(detail);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        const message = loadError instanceof Error ? loadError.message : "Request failed.";
        setPageError(message);
        setToast({ type: "error", message });
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadLedgerView();
    return () => {
      isActive = false;
    };
  }, [activePeriod?.id, ledgerId]);

  useEffect(() => {
    setSelectedView(String(ledgerId));
  }, [ledgerId]);

  const filteredLedgerIdentifiers = useMemo(() => {
    if (!ledgerView) {
      return [];
    }

    const query = ledgerViewSearch.trim();
    if (!query) {
      return ledgerView.identifiers;
    }

    return ledgerView.identifiers.filter((identifierRow) =>
      identifierRow.number.includes(query),
    );
  }, [ledgerView, ledgerViewSearch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [ledgerViewSearch, ledgerId]);

  const totalPages = Math.max(1, Math.ceil(filteredLedgerIdentifiers.length / IDENTIFIERS_PER_PAGE));
  const paginatedIdentifiers = useMemo(() => {
    const startIndex = (currentPage - 1) * IDENTIFIERS_PER_PAGE;
    return filteredLedgerIdentifiers.slice(startIndex, startIndex + IDENTIFIERS_PER_PAGE);
  }, [currentPage, filteredLedgerIdentifiers]);

  const visiblePageIndicators = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => String(index + 1));
    }

    if (currentPage <= 3) {
      return ["1", "2", "3", "4", "…", String(totalPages)];
    }

    if (currentPage >= totalPages - 2) {
      return [
        "1",
        "…",
        String(totalPages - 3),
        String(totalPages - 2),
        String(totalPages - 1),
        String(totalPages),
      ];
    }

    return [
      "1",
      "…",
      String(currentPage - 1),
      String(currentPage),
      String(currentPage + 1),
      "…",
      String(totalPages),
    ];
  }, [currentPage, totalPages]);

  async function openTicketView(ticketNumber: string) {
    setIsTicketViewLoading(true);
    try {
      const detail = await fetchTicketDetail(ticketNumber);
      setSelectedTicketDetail(detail);
    } catch (viewError) {
      const message = viewError instanceof Error ? viewError.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setIsTicketViewLoading(false);
    }
  }

  async function handleViewChange(nextValue: string) {
    setSelectedView(nextValue);
    setIsLoading(true);
    setPageError(null);

    try {
      if (nextValue === "all") {
        const activeLedgers = ledgerOptions.length
          ? ledgerOptions
          : activePeriod
            ? (await fetchLedgers({ period_id: activePeriod.id })).filter((ledger) => ledger.is_active)
            : [];

        const views = await Promise.all(activeLedgers.map((ledger) => fetchLedgerView(ledger.id)));
        const combinedView = buildCombinedLedgerView(views, activePeriod?.name || null);
        setLedgerOptions(activeLedgers);
        setLedgerView(combinedView);
      } else {
        const detail = await fetchLedgerView(Number(nextValue));
        setLedgerView(detail);
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Request failed.";
      setPageError(message);
      setToast({ type: "error", message });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <WorkspaceShell>
      {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
      {selectedTicketDetail || isTicketViewLoading ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/35 px-4 py-6"
          onClick={() => {
            setSelectedTicketDetail(null);
            setIsTicketViewLoading(false);
          }}
        >
          <div
            className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[30px] border border-stone-900/10 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            {isTicketViewLoading ? (
              <p className="text-sm text-stone-500">Loading ticket view...</p>
            ) : selectedTicketDetail ? (
              <TicketReceiptCard
                ticket={selectedTicketDetail}
                periodName={ledgerView?.ledger.period_name}
                className="mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[1800px] px-4 py-3 sm:px-6 lg:px-8 lg:py-5">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_340px]">
          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Ledger view</p>
                <h1 className="mt-2 text-2xl font-semibold text-stone-950">
                  {selectedView === "all" ? "All ledgers" : ledgerView?.ledger.name || "Ledger"}
                </h1>
                <p className="mt-2 text-sm text-stone-500">
                  Click a recorded amount to open the corresponding ticket receipt.
                </p>
              </div>
              <Link href="/ledgers">
                <Button variant="outline" className="h-11 px-4">
                  <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
                  Back to ledgers
                </Button>
              </Link>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input
                value={ledgerViewSearch}
                onChange={(event) => setLedgerViewSearch(event.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="Search identifier"
                className="max-w-xs bg-white"
                disabled={isLoading}
              />
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                Choose ledger
                <select
                  value={selectedView}
                  onChange={(event) => handleViewChange(event.target.value)}
                  className="h-11 min-w-[220px] rounded-2xl border border-stone-900/10 bg-white px-4 text-sm font-medium normal-case tracking-normal text-stone-900 shadow-sm outline-none transition focus:border-stone-400"
                  disabled={isLoading}
                >
                  <option value="all">All ledgers</option>
                  {ledgerOptions.map((ledger) => (
                    <option key={ledger.id} value={String(ledger.id)}>
                      {ledger.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 max-h-[820px] overflow-y-auto pr-2">
              {isLoading ? (
                <p className="text-sm text-stone-500">Loading ledger view...</p>
              ) : pageError ? (
                <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                  {pageError}
                </div>
              ) : filteredLedgerIdentifiers.length ? (
                <div className="space-y-4">
                  <div className="sticky top-0 z-10 -mx-1 rounded-[22px] border border-stone-900/8 bg-white/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/85">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-500">
                    <p>
                      Showing {(currentPage - 1) * IDENTIFIERS_PER_PAGE + 1}
                      {" "}to{" "}
                      {Math.min(currentPage * IDENTIFIERS_PER_PAGE, filteredLedgerIdentifiers.length)}
                      {" "}of{" "}
                      {filteredLedgerIdentifiers.length} identifiers
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 px-3"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      {visiblePageIndicators.map((pageNumber, index) =>
                        pageNumber === "…" ? (
                          <span
                            key={`ellipsis-${index}`}
                            className="inline-flex h-10 min-w-10 items-center justify-center px-2 text-sm font-medium text-stone-400"
                          >
                            …
                          </span>
                        ) : (
                          <Button
                            key={pageNumber}
                            type="button"
                            variant={Number(pageNumber) === currentPage ? "default" : "outline"}
                            className="h-10 min-w-10 px-3"
                            onClick={() => setCurrentPage(Number(pageNumber))}
                          >
                            {pageNumber}
                          </Button>
                        ),
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 px-3"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                  {paginatedIdentifiers.map((identifierRow) => (
                    <div
                      key={identifierRow.identifier_id}
                      className="rounded-[22px] border border-stone-900/8 bg-[#f7f4ef] px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-3 text-sm xl:flex-nowrap">
                        <span className="w-[54px] shrink-0 font-mono text-base font-semibold tracking-[0.2em] text-stone-950">
                          {identifierRow.number}
                        </span>
                        <span className="shrink-0 font-mono text-stone-400">-&gt;</span>
                        <div className="min-w-[180px] flex-1 break-words font-mono text-sm text-stone-700">
                          {identifierRow.recordings.length ? (
                            <>
                              {identifierRow.recordings.map((recording, index) => (
                                <span key={recording.allocation_id}>
                                  {recording.ticket_number ? (
                                    <button
                                      type="button"
                                      className="font-semibold text-stone-950 underline decoration-dotted underline-offset-4 hover:text-stone-600"
                                      onClick={() => openTicketView(recording.ticket_number!)}
                                    >
                                      {recording.display_amount}
                                    </button>
                                  ) : (
                                    <span className="font-semibold text-stone-950">{recording.display_amount}</span>
                                  )}
                                  <span className="text-stone-400">
                                    {index === identifierRow.recordings.length - 1 ? ".------" : "."}
                                  </span>
                                </span>
                              ))}
                            </>
                          ) : (
                            <span className="text-stone-400">------</span>
                          )}
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-stone-700">
                          Usage {formatCompactAmount(identifierRow.allocated_amount)}/{ledgerView ? formatCompactAmount(ledgerView.summary.capacity_per_identifier) : "0"}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-stone-700">
                          Left {formatCompactAmount(identifierRow.remaining_capacity)}
                        </span>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                  No identifiers matched "{ledgerViewSearch}".
                </div>
              )}
            </div>
          </article>

          <aside className="space-y-4">
            <div className="rounded-[22px] border border-stone-900/8 bg-white px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Ledger info</p>
              <div className="mt-3 space-y-2 text-sm text-stone-600">
                <p><span className="font-semibold text-stone-900">Period:</span> {ledgerView?.ledger.period_name || "-"}</p>
                <p><span className="font-semibold text-stone-900">Priority:</span> {selectedView === "all" ? "Combined view" : ledgerView?.ledger?.is_capacity_reserve ? "Reserve helper" : ledgerView?.ledger.priority}</p>
                <p><span className="font-semibold text-stone-900">Status:</span> {ledgerView?.ledger.is_active ? "Active" : "Closed"}</p>
                <p><span className="font-semibold text-stone-900">Ends:</span> {formatDateTime(ledgerView?.ledger.end_date || null)}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[22px] border border-stone-900/8 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Capacity / identifier</p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">
                  {ledgerView ? formatCompactAmount(ledgerView.summary.capacity_per_identifier) : "0"}
                </p>
              </div>
              <div className="rounded-[22px] border border-stone-900/8 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Identifiers used</p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">
                  {ledgerView?.summary.used_identifier_count ?? 0}
                </p>
              </div>
              <div className="rounded-[22px] border border-stone-900/8 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Allocated total</p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">
                  {ledgerView ? formatCompactAmount(ledgerView.summary.allocated_total) : "0"}
                </p>
              </div>
              <div className="rounded-[22px] border border-stone-900/8 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Remaining total</p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">
                  {ledgerView ? formatCompactAmount(ledgerView.summary.remaining_capacity) : "0"}
                </p>
              </div>
              <div className="rounded-[22px] border border-stone-900/8 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Mode</p>
                <div className="mt-3 flex flex-wrap gap-2 text-sm text-stone-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-stone-50 px-3 py-2">
                    <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5" />
                    Live view
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-stone-50 px-3 py-2">
                    <FontAwesomeIcon icon={ledgerView?.ledger.is_capacity_reserve ? faLock : faLayerGroup} className="h-3.5 w-3.5" />
                    {selectedView === "all"
                      ? "Combined capacity"
                      : ledgerView?.ledger.is_capacity_reserve
                        ? "Reserve helper"
                        : "Priority ledger"}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </WorkspaceShell>
  );
}

function buildCombinedLedgerView(
  views: FlowBitLedgerView[],
  periodName: string | null,
): FlowBitLedgerView {
  const firstLedger = views[0]?.ledger;
  const identifierMap = new Map<
    number,
    {
      identifier_id: number;
      number: string;
      recordings: FlowBitLedgerView["identifiers"][number]["recordings"];
      allocated_amount: number;
      remaining_capacity: number;
      capacity: number;
    }
  >();

  let allocatedTotal = 0;
  let combinedCapacityPerIdentifier = 0;

  views.forEach((view) => {
    combinedCapacityPerIdentifier += Number(view.summary.capacity_per_identifier || "0");
    allocatedTotal += Number(view.summary.allocated_total || "0");

    view.identifiers.forEach((row) => {
      const existing = identifierMap.get(row.identifier_id);
      if (!existing) {
        identifierMap.set(row.identifier_id, {
          identifier_id: row.identifier_id,
          number: row.number,
          recordings: [...row.recordings],
          allocated_amount: Number(row.allocated_amount || "0"),
          remaining_capacity: Number(row.remaining_capacity || "0"),
          capacity: Number(row.allocated_amount || "0") + Number(row.remaining_capacity || "0"),
        });
        return;
      }

      existing.recordings.push(...row.recordings);
      existing.allocated_amount += Number(row.allocated_amount || "0");
      existing.remaining_capacity += Number(row.remaining_capacity || "0");
      existing.capacity += Number(row.allocated_amount || "0") + Number(row.remaining_capacity || "0");
    });
  });

  const identifiers = Array.from(identifierMap.values())
    .sort((left, right) => left.number.localeCompare(right.number))
    .map((row) => ({
      identifier_id: row.identifier_id,
      number: row.number,
      recording_display: row.recordings.length
        ? `${row.recordings.map((recording) => recording.display_amount).join(".")}.------`
        : "------",
      recordings: row.recordings.sort((left, right) => {
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      }),
      allocated_amount: row.allocated_amount.toFixed(2),
      remaining_capacity: row.remaining_capacity.toFixed(2),
    }));

  const identifierCount = identifiers.length;
  const totalCapacity = combinedCapacityPerIdentifier * identifierCount;
  const remainingCapacity = Math.max(totalCapacity - allocatedTotal, 0);
  const usedIdentifierCount = identifiers.filter((row) => Number(row.allocated_amount) > 0).length;

  return {
    ledger: {
      id: firstLedger?.id || 0,
      period: firstLedger?.period || null,
      period_name: periodName,
      name: "All ledgers",
      end_date: firstLedger?.end_date || new Date().toISOString(),
      limit_per_identifier: combinedCapacityPerIdentifier.toFixed(2),
      priority: 0,
      is_active: true,
      is_capacity_reserve: false,
      closed_at: null,
      created_at: firstLedger?.created_at || new Date().toISOString(),
    },
    summary: {
      identifier_count: identifierCount,
      used_identifier_count: usedIdentifierCount,
      capacity_per_identifier: combinedCapacityPerIdentifier.toFixed(2),
      total_capacity: totalCapacity.toFixed(2),
      allocated_total: allocatedTotal.toFixed(2),
      remaining_capacity: remainingCapacity.toFixed(2),
    },
    identifiers,
  };
}
