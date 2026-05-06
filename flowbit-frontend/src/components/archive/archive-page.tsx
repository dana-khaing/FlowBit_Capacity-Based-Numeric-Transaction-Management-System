"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxArchive,
  faCircleNotch,
  faListCheck,
  faReceipt,
  faTicket,
  faTrophy,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import {
  formatTicketAmount,
  TicketReceiptCard,
} from "@/components/tickets/ticket-receipt-card";
import { Button } from "@/components/ui/button";
import { fetchLedgers, type FlowBitLedger } from "@/lib/ledger-client";
import { fetchApprovedOverflows, type FlowBitOverflow } from "@/lib/overflow-client";
import { fetchPeriods, type FlowBitPeriod } from "@/lib/period-client";
import {
  fetchTicketDetail,
  fetchTicketPage,
  type FlowBitTicketDetail,
  type FlowBitTicketListItem,
} from "@/lib/ticket-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function formatArchiveDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatArchiveDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ArchivePage() {
  const [periods, setPeriods] = useState<FlowBitPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [ledgers, setLedgers] = useState<FlowBitLedger[]>([]);
  const [tickets, setTickets] = useState<FlowBitTicketListItem[]>([]);
  const [ticketCount, setTicketCount] = useState(0);
  const [ticketEntries, setTicketEntries] = useState(0);
  const [ticketTotalAmount, setTicketTotalAmount] = useState("0.00");
  const [approvedOverflows, setApprovedOverflows] = useState<FlowBitOverflow[]>([]);
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(true);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<FlowBitTicketDetail | null>(null);
  const [isTicketLoading, setIsTicketLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const archivedPeriods = useMemo(
    () =>
      periods
        .filter((period) => !period.is_open)
        .slice()
        .sort(
          (left, right) =>
            new Date(right.end_date).getTime() - new Date(left.end_date).getTime(),
        ),
    [periods],
  );

  const selectedPeriod =
    archivedPeriods.find((period) => period.id === selectedPeriodId) ?? null;

  useEffect(() => {
    let isMounted = true;
    setIsLoadingPeriods(true);

    fetchPeriods()
      .then((allPeriods) => {
        if (!isMounted) {
          return;
        }
        setPeriods(allPeriods);
        const closedPeriods = allPeriods
          .filter((period) => !period.is_open)
          .slice()
          .sort(
            (left, right) =>
              new Date(right.end_date).getTime() - new Date(left.end_date).getTime(),
          );
        setSelectedPeriodId((current) => current ?? closedPeriods[0]?.id ?? null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Request failed.";
        setToast({ type: "error", message });
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingPeriods(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) {
      setLedgers([]);
      setTickets([]);
      setTicketCount(0);
      setTicketEntries(0);
      setTicketTotalAmount("0.00");
      setApprovedOverflows([]);
      return;
    }

    let isMounted = true;
    setIsLoadingArchive(true);

    Promise.all([
      fetchLedgers({ period_id: selectedPeriodId, section: "archive" }),
      fetchTicketPage({
        periodId: selectedPeriodId,
        page: 1,
        pageSize: 20,
        sort: "newest",
      }),
      fetchApprovedOverflows({ periodId: selectedPeriodId, limit: 20 }),
    ])
      .then(([archivedLedgers, ticketPage, overflows]) => {
        if (!isMounted) {
          return;
        }
        setLedgers(
          archivedLedgers.slice().sort((left, right) => {
            if (left.is_capacity_reserve !== right.is_capacity_reserve) {
              return left.is_capacity_reserve ? 1 : -1;
            }
            return left.priority - right.priority;
          }),
        );
        setTickets(ticketPage.results);
        setTicketCount(ticketPage.summary.ticket_count);
        setTicketEntries(ticketPage.summary.total_entries);
        setTicketTotalAmount(ticketPage.summary.total_amount);
        setApprovedOverflows(overflows);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Request failed.";
        setToast({ type: "error", message });
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingArchive(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedPeriodId]);

  async function openTicket(ticketNumber: string) {
    setSelectedTicketNumber(ticketNumber);
    setSelectedTicket(null);
    setIsTicketLoading(true);
    try {
      const detail = await fetchTicketDetail(ticketNumber);
      setSelectedTicket(detail);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
      setSelectedTicketNumber(null);
    } finally {
      setIsTicketLoading(false);
    }
  }

  function closeTicket() {
    setSelectedTicketNumber(null);
    setSelectedTicket(null);
    setIsTicketLoading(false);
  }

  return (
    <>
      <AppSectionPage
        eyebrow="Archive"
        title="Archive"
        description="Review closed periods, archived ledgers, tickets, and approved spill over."
        headerClassName="hidden"
        showDefaultAside={false}
      >
        {toast ? (
          <AdminActionToast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  Closed periods
                </p>
                <p className="mt-2 text-lg font-semibold text-stone-950">
                  Period archive
                </p>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                {archivedPeriods.length}
              </span>
            </div>

            {isLoadingPeriods ? (
              <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                <FontAwesomeIcon
                  icon={faCircleNotch}
                  className="h-4 w-4 animate-spin text-stone-400"
                />
                Loading closed periods.
              </div>
            ) : archivedPeriods.length ? (
              <div className="mt-5 max-h-[calc(100vh-13rem)] space-y-3 overflow-y-auto pr-1">
                {archivedPeriods.map((period) => {
                  const isActive = period.id === selectedPeriodId;
                  return (
                    <button
                      key={period.id}
                      type="button"
                      onClick={() => setSelectedPeriodId(period.id)}
                      className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                        isActive
                          ? "border-stone-950 bg-stone-950 text-white shadow-[0_14px_30px_rgba(28,24,20,0.12)]"
                          : "border-stone-900/8 bg-stone-50 text-stone-900 hover:border-stone-300 hover:bg-white"
                      }`}
                    >
                      <p
                        className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                          isActive ? "text-stone-300" : "text-stone-400"
                        }`}
                      >
                        Period
                      </p>
                      <p className="mt-2 text-lg font-semibold">{period.name}</p>
                      <p
                        className={`mt-3 text-sm ${
                          isActive ? "text-stone-200" : "text-stone-600"
                        }`}
                      >
                        {formatArchiveDate(period.start_date)} to{" "}
                        {formatArchiveDate(period.end_date)}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                No closed periods yet.
              </div>
            )}
          </article>

          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                      Tickets
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-stone-950">
                      {ticketCount}
                    </p>
                  </div>
                  <FontAwesomeIcon icon={faTicket} className="h-5 w-5 text-stone-300" />
                </div>
              </article>
              <article className="rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                      Entries
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-stone-950">
                      {ticketEntries}
                    </p>
                  </div>
                  <FontAwesomeIcon icon={faReceipt} className="h-5 w-5 text-stone-300" />
                </div>
              </article>
              <article className="rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                      Total amount
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-stone-950">
                      {formatTicketAmount(ticketTotalAmount)}
                    </p>
                  </div>
                  <FontAwesomeIcon icon={faBoxArchive} className="h-5 w-5 text-stone-300" />
                </div>
              </article>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
              <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                      Lucky draw
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      Draw numbers
                    </p>
                  </div>
                  <FontAwesomeIcon icon={faTrophy} className="h-5 w-5 text-stone-300" />
                </div>
                <div className="mt-5 rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                  No archived lucky draw numbers are stored yet.
                </div>
              </article>

              <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                      Spill over
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      Approved only
                    </p>
                  </div>
                  <FontAwesomeIcon icon={faListCheck} className="h-5 w-5 text-stone-300" />
                </div>
                <div className="mt-5 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                  {isLoadingArchive ? (
                    <p className="text-sm text-stone-500">Loading spill over...</p>
                  ) : approvedOverflows.length ? (
                    approvedOverflows.map((overflow) => (
                      <div
                        key={overflow.id}
                        className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-semibold text-stone-950">
                              {overflow.identifier_number}
                            </span>
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                              {overflow.status}
                            </span>
                          </div>
                          <span className="text-base font-semibold text-stone-950">
                            {formatTicketAmount(
                              overflow.amount_to_approve || overflow.excess_amount,
                            )}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-600">
                          <span>
                            Collaborator:{" "}
                            {overflow.collaborator_names.length
                              ? overflow.collaborator_names.join(", ")
                              : "-"}
                          </span>
                          <span>Approved: {formatArchiveDateTime(overflow.approved_at)}</span>
                        </div>
                        {overflow.ticket_number ? (
                          <div className="mt-4">
                            <Button
                              variant="outline"
                              className="rounded-[16px]"
                              onClick={() => openTicket(overflow.ticket_number!)}
                            >
                              Ticket
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                      No approved spill over for this closed period.
                    </div>
                  )}
                </div>
              </article>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                      Ledgers
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      Archived ledgers
                    </p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                    {ledgers.length}
                  </span>
                </div>
                <div className="mt-5 max-h-[460px] space-y-3 overflow-y-auto pr-1">
                  {isLoadingArchive ? (
                    <p className="text-sm text-stone-500">Loading archived ledgers...</p>
                  ) : ledgers.length ? (
                    ledgers.map((ledger) => (
                      <div
                        key={ledger.id}
                        className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-stone-950">
                              {ledger.name}
                            </p>
                            <p className="mt-2 text-sm text-stone-600">
                              Closed {formatArchiveDateTime(ledger.closed_at)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {ledger.is_capacity_reserve ? (
                              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                                Reserve
                              </span>
                            ) : (
                              <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-700">
                                Priority {ledger.priority}
                              </span>
                            )}
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                              {formatTicketAmount(ledger.limit_per_identifier)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                      No archived ledgers for this period.
                    </div>
                  )}
                </div>
              </article>

              <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                      Tickets
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      Archived tickets
                    </p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                    {ticketCount}
                  </span>
                </div>
                <div className="mt-5 max-h-[460px] space-y-3 overflow-y-auto pr-1">
                  {isLoadingArchive ? (
                    <p className="text-sm text-stone-500">Loading archived tickets...</p>
                  ) : tickets.length ? (
                    tickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => openTicket(ticket.ticket_number)}
                        className="w-full rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4 text-left transition hover:border-stone-300 hover:bg-white"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-stone-950">
                              {ticket.ticket_number}
                            </p>
                            <p className="mt-2 text-sm text-stone-600">
                              {ticket.customer_name?.trim() || "-"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-semibold text-stone-950">
                              {formatTicketAmount(ticket.total_amount)}
                            </p>
                            <p className="mt-2 text-sm text-stone-600">
                              {ticket.transaction_count}{" "}
                              {ticket.transaction_count === 1 ? "entry" : "entries"}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                      No archived tickets for this period.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </div>
        </div>
      </AppSectionPage>

      {selectedTicketNumber ? (
        <div
          className="fixed inset-0 z-50 bg-stone-950/55 px-4 py-8 backdrop-blur-sm"
          onClick={closeTicket}
        >
          <div
            className="mx-auto max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_20px_60px_rgba(28,24,20,0.24)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  Archived ticket
                </p>
                <p className="mt-2 text-lg font-semibold text-stone-950">
                  {selectedTicketNumber}
                </p>
              </div>
              <Button
                variant="ghost"
                className="h-11 w-11 rounded-[16px] p-0"
                onClick={closeTicket}
                aria-label="Close archived ticket"
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
              </Button>
            </div>

            {isTicketLoading ? (
              <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                <FontAwesomeIcon
                  icon={faCircleNotch}
                  className="h-4 w-4 animate-spin text-stone-400"
                />
                Loading archived ticket.
              </div>
            ) : selectedTicket ? (
              <div className="mt-6">
                <TicketReceiptCard
                  ticket={selectedTicket}
                  periodName={selectedPeriod?.name}
                  className="mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
