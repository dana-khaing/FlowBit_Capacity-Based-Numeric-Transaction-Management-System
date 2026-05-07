"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxArchive,
  faCircleNotch,
  faListCheck,
  faMagnifyingGlass,
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
import {
  fetchApprovedOverflowPage,
  fetchCollaborators,
  type FlowBitCollaborator,
  type FlowBitOverflow,
} from "@/lib/overflow-client";
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

type ArchiveSearchType = "ledgers" | "tickets" | "spillover";
type ArchiveSearchFields = {
  ticket: string;
  customer: string;
  identifier: string;
  collaborator: string;
};

const ARCHIVE_PAGE_SIZE = 20;
const ARCHIVE_SECTION_CARD_CLASS =
  "flex h-[32rem] flex-col rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]";

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
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketTotalPages, setTicketTotalPages] = useState(1);
  const [approvedOverflows, setApprovedOverflows] = useState<FlowBitOverflow[]>([]);
  const [overflowPage, setOverflowPage] = useState(1);
  const [overflowTotalPages, setOverflowTotalPages] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(true);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<FlowBitTicketDetail | null>(null);
  const [isTicketLoading, setIsTicketLoading] = useState(false);
  const [searchType, setSearchType] = useState<ArchiveSearchType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFields, setSearchFields] = useState<ArchiveSearchFields>({
    ticket: "",
    customer: "",
    identifier: "",
    collaborator: "",
  });
  const [collaborators, setCollaborators] = useState<FlowBitCollaborator[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchedTickets, setSearchedTickets] = useState<FlowBitTicketListItem[]>([]);
  const [searchedOverflows, setSearchedOverflows] = useState<FlowBitOverflow[]>([]);
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

  const pagedLedgers = useMemo(() => {
    const start = (ledgerPage - 1) * ARCHIVE_PAGE_SIZE;
    return ledgers.slice(start, start + ARCHIVE_PAGE_SIZE);
  }, [ledgerPage, ledgers]);

  const ledgerTotalPages = useMemo(
    () => Math.max(1, Math.ceil(ledgers.length / ARCHIVE_PAGE_SIZE)),
    [ledgers.length],
  );

  const searchedLedgers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const candidates = normalizedQuery
      ? ledgers.filter((ledger) => {
          const searchable = [
            ledger.name,
            ledger.is_capacity_reserve ? "reserve" : "",
            `priority ${ledger.priority}`,
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(normalizedQuery);
        })
      : ledgers;
    return candidates.slice(0, 20);
  }, [ledgers, searchQuery]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingPeriods(true);

    Promise.all([fetchPeriods(), fetchCollaborators()])
      .then(([allPeriods, collaboratorRows]) => {
        if (!isMounted) {
          return;
        }
        setPeriods(allPeriods);
        setCollaborators(
          collaboratorRows.slice().sort((left, right) =>
            left.full_name.localeCompare(right.full_name),
          ),
        );
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
    setTicketPage(1);
    setOverflowPage(1);
    setLedgerPage(1);
    setSelectedTicketNumber(null);
    setSelectedTicket(null);
    setIsTicketLoading(false);
  }, [selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setLedgers([]);
      setTickets([]);
      setTicketCount(0);
      setTicketEntries(0);
      setTicketTotalAmount("0.00");
      setTicketTotalPages(1);
      setApprovedOverflows([]);
      setOverflowTotalPages(1);
      return;
    }

    let isMounted = true;
    setIsLoadingArchive(true);

    Promise.all([
      fetchLedgers({ period_id: selectedPeriodId, section: "archive" }),
      fetchTicketPage({
        periodId: selectedPeriodId,
        page: ticketPage,
        pageSize: ARCHIVE_PAGE_SIZE,
        sort: "newest",
      }),
      fetchApprovedOverflowPage({
        periodId: selectedPeriodId,
        page: overflowPage,
        pageSize: ARCHIVE_PAGE_SIZE,
      }),
    ])
      .then(([archivedLedgers, ticketPageResponse, overflowPageResponse]) => {
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
        setTickets(ticketPageResponse.results);
        setTicketCount(ticketPageResponse.summary.ticket_count);
        setTicketEntries(ticketPageResponse.summary.total_entries);
        setTicketTotalAmount(ticketPageResponse.summary.total_amount);
        setTicketTotalPages(ticketPageResponse.total_pages);
        setApprovedOverflows(overflowPageResponse.results);
        setOverflowTotalPages(overflowPageResponse.total_pages);
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
  }, [overflowPage, selectedPeriodId, ticketPage]);

  useEffect(() => {
    if (ledgerPage > ledgerTotalPages) {
      setLedgerPage(ledgerTotalPages);
    }
  }, [ledgerPage, ledgerTotalPages]);

  useEffect(() => {
    if (!searchType || !selectedPeriodId) {
      setSearchedTickets([]);
      setSearchedOverflows([]);
      setIsSearchLoading(false);
      return;
    }

    if (searchType === "ledgers") {
      setSearchedTickets([]);
      setSearchedOverflows([]);
      setIsSearchLoading(false);
      return;
    }

    let isMounted = true;
    setIsSearchLoading(true);

    if (searchType === "tickets") {
      fetchTicketPage({
        periodId: selectedPeriodId,
        page: 1,
        pageSize: 20,
        sort: "newest",
        ticketNumber: searchFields.ticket.trim(),
        customerName: searchFields.customer.trim(),
        identifierNumber: searchFields.identifier.trim(),
      })
        .then((response) => {
          if (!isMounted) {
            return;
          }
          setSearchedTickets(response.results);
          setSearchedOverflows([]);
        })
        .catch((error) => {
          if (!isMounted) {
            return;
          }
          const message = error instanceof Error ? error.message : "Request failed.";
          setToast({ type: "error", message });
        })
        .finally(() => {
          if (isMounted) {
            setIsSearchLoading(false);
          }
        });
    } else {
      fetchApprovedOverflowPage({
        periodId: selectedPeriodId,
        page: 1,
        pageSize: 20,
        identifierNumber: searchFields.identifier.trim(),
        collaboratorName: searchFields.collaborator.trim(),
      })
        .then((response) => {
          if (!isMounted) {
            return;
          }
          setSearchedOverflows(response.results);
          setSearchedTickets([]);
        })
        .catch((error) => {
          if (!isMounted) {
            return;
          }
          const message = error instanceof Error ? error.message : "Request failed.";
          setToast({ type: "error", message });
        })
        .finally(() => {
          if (isMounted) {
            setIsSearchLoading(false);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [searchFields, searchQuery, searchType, selectedPeriodId]);

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

  function openSearch(type: ArchiveSearchType) {
    setSearchType(type);
    setSearchQuery("");
    setSearchFields({ ticket: "", customer: "", identifier: "", collaborator: "" });
  }

  function closeSearch() {
    setSearchType(null);
    setSearchQuery("");
    setSearchFields({ ticket: "", customer: "", identifier: "", collaborator: "" });
    setIsSearchLoading(false);
    setSearchedTickets([]);
    setSearchedOverflows([]);
  }

  function openOverflowTicket(overflow: FlowBitOverflow) {
    if (!overflow.ticket_number) {
      return;
    }
    closeSearch();
    void openTicket(overflow.ticket_number);
  }

  function renderPager(
    page: number,
    totalPages: number,
    onPageChange: (page: number) => void,
  ) {
    if (totalPages <= 1) {
      return null;
    }

    return (
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-900/8 pt-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <span className="text-sm font-medium text-stone-600">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    );
  }

  function renderLedgerRow(ledger: FlowBitLedger, closeHandler?: () => void) {
    return (
      <Link
        key={ledger.id}
        href={`/ledgers/${ledger.id}`}
        onClick={closeHandler}
        className="block rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4 transition hover:border-stone-300 hover:bg-white"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-stone-950">
              {ledger.name}
            </p>
            <p className="mt-2 text-sm text-stone-600">
              Closed {formatArchiveDateTime(ledger.closed_at)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                ledger.is_capacity_reserve
                  ? "bg-sky-100 text-sky-700"
                  : "bg-stone-200 text-stone-700"
              }`}
            >
              {ledger.is_capacity_reserve ? "Reserve" : `Priority ${ledger.priority}`}
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              {formatTicketAmount(ledger.limit_per_identifier)}
            </span>
          </div>
        </div>
      </Link>
    );
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

            <div className="grid auto-rows-fr gap-5 xl:grid-cols-2">
              <article className={ARCHIVE_SECTION_CARD_CLASS}>
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
                <div className="mt-5 flex min-h-0 flex-1 flex-col">
                  <div className="flex flex-1 items-center rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                    No archived lucky draw numbers are stored yet.
                  </div>
                </div>
              </article>

              <article className={ARCHIVE_SECTION_CARD_CLASS}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                      Spill over
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      Approved only
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-10 rounded-full p-0"
                      onClick={() => openSearch("spillover")}
                    >
                      <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4" />
                    </Button>
                    <FontAwesomeIcon icon={faListCheck} className="h-5 w-5 text-stone-300" />
                  </div>
                </div>
                <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {isLoadingArchive ? (
                    <p className="text-sm text-stone-500">Loading spill over...</p>
                  ) : approvedOverflows.length ? (
                    approvedOverflows.map((overflow) => (
                      <button
                        key={overflow.id}
                        type="button"
                        onClick={() => openOverflowTicket(overflow)}
                        disabled={!overflow.ticket_number}
                        className={`w-full rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-left transition ${
                          overflow.ticket_number
                            ? "hover:border-emerald-300 hover:bg-emerald-100"
                            : "cursor-default"
                        }`}
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
                          <span>Ticket: {overflow.ticket_number || "-"}</span>
                          <span>
                            Collaborator:{" "}
                            {overflow.collaborator_names.length
                              ? overflow.collaborator_names.join(", ")
                              : "-"}
                          </span>
                          <span>Approved: {formatArchiveDateTime(overflow.approved_at)}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                      No approved spill over for this closed period.
                    </div>
                  )}
                </div>
                {renderPager(overflowPage, overflowTotalPages, setOverflowPage)}
              </article>
            </div>

            <div className="grid auto-rows-fr gap-5 xl:grid-cols-2">
              <article className={ARCHIVE_SECTION_CARD_CLASS}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                      Ledgers
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      Archived ledgers
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-10 rounded-full p-0"
                      onClick={() => openSearch("ledgers")}
                    >
                      <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4" />
                    </Button>
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                      {ledgers.length}
                    </span>
                  </div>
                </div>
                <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {isLoadingArchive ? (
                    <p className="text-sm text-stone-500">Loading archived ledgers...</p>
                  ) : pagedLedgers.length ? (
                    pagedLedgers.map((ledger) => renderLedgerRow(ledger))
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                      No archived ledgers for this period.
                    </div>
                  )}
                </div>
                {renderPager(ledgerPage, ledgerTotalPages, setLedgerPage)}
              </article>

              <article className={ARCHIVE_SECTION_CARD_CLASS}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                      Tickets
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      Archived tickets
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-10 rounded-full p-0"
                      onClick={() => openSearch("tickets")}
                    >
                      <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4" />
                    </Button>
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                      {ticketCount}
                    </span>
                  </div>
                </div>
                <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
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
                {renderPager(ticketPage, ticketTotalPages, setTicketPage)}
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

      {searchType ? (
        <div
          className="fixed inset-0 z-40 bg-stone-950/45 px-4 py-6 backdrop-blur-sm"
          onClick={closeSearch}
        >
          <div
            className="mx-auto flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_30px_90px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  Search
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                  {searchType === "tickets"
                    ? "Archived tickets"
                    : searchType === "ledgers"
                      ? "Archived ledgers"
                      : "Approved spill over"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeSearch}
                className="rounded-full border border-stone-900/10 bg-stone-50 p-3 text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5">
              {searchType === "ledgers" ? (
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search ledger name or priority"
                  className="w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                />
              ) : searchType === "tickets" ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Ticket
                    </span>
                    <input
                      type="search"
                      value={searchFields.ticket}
                      onChange={(event) =>
                        setSearchFields((current) => ({
                          ...current,
                          ticket: event.target.value,
                        }))
                      }
                      placeholder="Ticket number"
                      className="w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Customer
                    </span>
                    <input
                      type="search"
                      value={searchFields.customer}
                      onChange={(event) =>
                        setSearchFields((current) => ({
                          ...current,
                          customer: event.target.value,
                        }))
                      }
                      placeholder="Customer name"
                      className="w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Identifier
                    </span>
                    <input
                      type="search"
                      value={searchFields.identifier}
                      onChange={(event) =>
                        setSearchFields((current) => ({
                          ...current,
                          identifier: event.target.value.replace(/\D/g, "").slice(0, 3),
                        }))
                      }
                      placeholder="000"
                      className="w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Identifier
                    </span>
                    <input
                      type="search"
                      value={searchFields.identifier}
                      onChange={(event) =>
                        setSearchFields((current) => ({
                          ...current,
                          identifier: event.target.value.replace(/\D/g, "").slice(0, 3),
                        }))
                      }
                      placeholder="000"
                      className="w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Collaborator
                    </span>
                    <select
                      value={searchFields.collaborator}
                      onChange={(event) =>
                        setSearchFields((current) => ({
                          ...current,
                          collaborator: event.target.value,
                        }))
                      }
                      className="w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                    >
                      <option value="">All collaborators</option>
                      {collaborators.map((collaborator) => (
                        <option key={collaborator.id} value={collaborator.full_name}>
                          {collaborator.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {isSearchLoading ? (
                <div className="inline-flex items-center gap-3 rounded-full border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                  <FontAwesomeIcon
                    icon={faCircleNotch}
                    className="h-4 w-4 animate-spin text-stone-400"
                  />
                  Searching archive.
                </div>
              ) : searchType === "ledgers" ? (
                searchedLedgers.length ? (
                  searchedLedgers.map((ledger) => renderLedgerRow(ledger, closeSearch))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                    No archived ledgers matched that search.
                  </div>
                )
              ) : searchType === "tickets" ? (
                searchedTickets.length ? (
                  searchedTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => {
                        closeSearch();
                        void openTicket(ticket.ticket_number);
                      }}
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
                    No archived tickets matched that search.
                  </div>
                )
              ) : searchedOverflows.length ? (
                searchedOverflows.map((overflow) => (
                  <button
                    key={overflow.id}
                    type="button"
                    onClick={() => openOverflowTicket(overflow)}
                    disabled={!overflow.ticket_number}
                    className={`w-full rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-left transition ${
                      overflow.ticket_number
                        ? "hover:border-emerald-300 hover:bg-emerald-100"
                        : "cursor-default"
                    }`}
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
                        {formatTicketAmount(overflow.amount_to_approve || overflow.excess_amount)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-600">
                      <span>Ticket: {overflow.ticket_number || "-"}</span>
                      <span>
                        Collaborator:{" "}
                        {overflow.collaborator_names.length
                          ? overflow.collaborator_names.join(", ")
                          : "-"}
                      </span>
                      <span>Approved: {formatArchiveDateTime(overflow.approved_at)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                  No approved spill over matched that search.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
