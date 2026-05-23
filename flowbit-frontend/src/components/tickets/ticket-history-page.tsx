"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faDownload,
  faMagnifyingGlass,
  faMinusCircle,
  faPrint,
  faReceipt,
  faRotateLeft,
  faShieldHalved,
  faTicket,
  faTriangleExclamation,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import { notifyDashboardUpdated } from "@/components/app/workspace-events";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { TicketRefundModal } from "@/components/tickets/ticket-refund-modal";
import {
  formatTicketDate,
  formatTicketAmount,
  getTicketCustomerDisplayName,
  getOverflowDisplayAmount,
  TicketReceiptCard,
} from "@/components/tickets/ticket-receipt-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUserState } from "@/components/auth/current-user-context";
import { usePeriodState } from "@/components/period/use-period-state";
import { getStoredUser } from "@/lib/auth-client";
import {
  fetchTicketDetail,
  fetchTicketPage,
  downloadTicketReceiptPdf,
  resolveOverflowAction,
  resolveTicketRefundAction,
  type FlowBitTicketDetail,
  type FlowBitTicketListItem,
} from "@/lib/ticket-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

export function TicketHistoryPage() {
  const currentUserState = useCurrentUserState();
  const pageSize = 20;
  const actionButtonClassName = "h-12 w-12 rounded-[18px] p-0";
  const actionLinkClassName =
    "inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-stone-900/10 bg-white text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950/20";
  const [tickets, setTickets] = useState<FlowBitTicketListItem[]>([]);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [serverTicketCount, setServerTicketCount] = useState(0);
  const [serverTotalEntries, setServerTotalEntries] = useState(0);
  const [serverTotalAmount, setServerTotalAmount] = useState("0.00");
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<
    string | null
  >(null);
  const [selectedTicket, setSelectedTicket] =
    useState<FlowBitTicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [refundFilter, setRefundFilter] = useState("active");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [adminOverrideCode, setAdminOverrideCode] = useState("");
  const [syncRepeatTicket, setSyncRepeatTicket] = useState(false);
  const [busyRefundAction, setBusyRefundAction] = useState<null | {
    kind: "ticket" | "transaction" | "overflow";
    id: number;
  }>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const {
    activePeriod,
    hasActivePeriod,
    isLoading: isPeriodLoading,
    error: periodError,
  } = usePeriodState();

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove("ticket-receipt-printing");
    };

    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      document.body.classList.remove("ticket-receipt-printing");
    };
  }, []);

  useEffect(() => {
    if (!hasActivePeriod || !activePeriod) {
      return;
    }

    setCurrentPage(1);
  }, [activePeriod?.id, dateFrom, dateTo, deferredSearchTerm, hasActivePeriod, refundFilter, sortBy]);

  useEffect(() => {
    if (!hasActivePeriod || !activePeriod) {
      setTickets([]);
      setSelectedTicket(null);
      setSelectedTicketNumber(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    fetchTicketPage({
      periodId: activePeriod.id,
      page: currentPage,
      pageSize,
      search: deferredSearchTerm,
      refundFilter,
      dateFrom,
      dateTo,
      sort: sortBy,
    })
      .then((response) => {
        if (!isMounted) {
          return;
        }
        const nextTickets = response.results;
        setTickets(nextTickets);
        setServerTotalPages(response.total_pages);
        setServerTicketCount(response.count);
        setServerTotalEntries(response.summary.total_entries);
        setServerTotalAmount(response.summary.total_amount);
        setSelectedTicketNumber((current) =>
          current &&
          nextTickets.some((ticket) => ticket.ticket_number === current)
            ? current
            : (nextTickets[0]?.ticket_number ?? null),
        );
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
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    activePeriod?.id,
    currentPage,
    dateFrom,
    dateTo,
    deferredSearchTerm,
    hasActivePeriod,
    pageSize,
    refundFilter,
  ]);

  const groupedTickets = useMemo(() => {
    const groups: Array<{ label: string; tickets: FlowBitTicketListItem[] }> =
      [];
    for (const ticket of tickets) {
      const label = new Date(ticket.created_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.label === label) {
        lastGroup.tickets.push(ticket);
      } else {
        groups.push({ label, tickets: [ticket] });
      }
    }
    return groups;
  }, [tickets]);

  useEffect(() => {
    if (!tickets.length) {
      setSelectedTicketNumber(null);
      setSelectedTicket(null);
      return;
    }

    if (
      !selectedTicketNumber ||
      !tickets.some(
        (ticket) => ticket.ticket_number === selectedTicketNumber,
      )
    ) {
      setSelectedTicketNumber(tickets[0].ticket_number);
    }
  }, [tickets, selectedTicketNumber]);

  function handlePrintReceipt() {
    document.body.classList.add("ticket-receipt-printing");
    window.print();
  }

  async function downloadSelectedTicket() {
    if (!selectedTicket) {
      return;
    }
    try {
      const blob = await downloadTicketReceiptPdf([
        selectedTicket.ticket_number,
      ]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedTicket.ticket_number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    }
  }

  async function refreshTicketHistoryState() {
    if (activePeriod) {
      const response = await fetchTicketPage({
        periodId: activePeriod.id,
        page: currentPage,
        pageSize,
        search: deferredSearchTerm,
        refundFilter,
        dateFrom,
        dateTo,
        sort: sortBy,
      });
      setTickets(response.results);
      setServerTotalPages(response.total_pages);
      setServerTicketCount(response.count);
      setServerTotalEntries(response.summary.total_entries);
      setServerTotalAmount(response.summary.total_amount);
    }
    if (selectedTicketNumber) {
      const detail = await fetchTicketDetail(selectedTicketNumber);
      setSelectedTicket(detail);
    }
  }

  async function runOverflowRefundAction(
    overflowId: number,
    kind: "overflow",
    csoRefundMode?: "return_to_tcso" | "refund_spill_over",
  ) {
    if (!adminOverrideCode.trim()) {
      setToast({
        type: "error",
        message: "Admin override code is required for refund actions.",
      });
      return;
    }

    setBusyRefundAction({ kind, id: overflowId });
    try {
      const response = await resolveOverflowAction({
        overflowId,
        action: "refund_overflow_only",
        adminOverrideCode: adminOverrideCode.trim() || undefined,
        csoRefundMode,
        syncRepeatTicket,
      });
      await refreshTicketHistoryState();
      setToast({
        type: "success",
        message: response.message || "Refund completed.",
      });
      setShowRefundModal(false);
      setAdminOverrideCode("");
      setSyncRepeatTicket(false);
      notifyDashboardUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setBusyRefundAction(null);
    }
  }

  async function runTicketRefundAction(
    action: "refund_ticket" | "refund_transaction",
    kind: "ticket" | "transaction",
    transactionId?: number,
    csoRefundMode?: "return_to_tcso" | "refund_spill_over",
  ) {
    if (!selectedTicketNumber) {
      return;
    }

    if (!adminOverrideCode.trim()) {
      setToast({
        type: "error",
        message: "Admin override code is required for refund actions.",
      });
      return;
    }

    const busyId = transactionId ?? 0;
    setBusyRefundAction({ kind, id: busyId });
    try {
      const response = await resolveTicketRefundAction({
        ticketNumber: selectedTicketNumber,
        action,
        transactionId,
        adminOverrideCode: adminOverrideCode.trim() || undefined,
        csoRefundMode,
        syncRepeatTicket,
      });
      await refreshTicketHistoryState();
      setToast({
        type: "success",
        message: response.message || "Refund completed.",
      });
      setShowRefundModal(false);
      setAdminOverrideCode("");
      setSyncRepeatTicket(false);
      notifyDashboardUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setBusyRefundAction(null);
    }
  }

  useEffect(() => {
    if (!selectedTicketNumber) {
      setSelectedTicket(null);
      return;
    }

    let isMounted = true;
    setIsDetailLoading(true);

    fetchTicketDetail(selectedTicketNumber)
      .then((detail) => {
        if (isMounted) {
          setSelectedTicket(detail);
        }
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
          setIsDetailLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTicketNumber]);

  useEffect(() => {
    if (!tickets.length) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }

      event.preventDefault();
      const currentIndex = tickets.findIndex(
        (ticket) => ticket.ticket_number === selectedTicketNumber,
      );
      const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(fallbackIndex + 1, tickets.length - 1)
          : Math.max(fallbackIndex - 1, 0);

      setSelectedTicketNumber(tickets[nextIndex].ticket_number);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tickets, selectedTicketNumber]);

  if (isPeriodLoading) {
    return (
      <AppSectionPage
        eyebrow="Tickets"
        title="Ticket history"
        description="Review every ticket created in the active period."
      >
        <div className="inline-flex items-center gap-3 rounded-full border border-stone-900/8 bg-stone-50 px-5 py-3 text-sm font-medium text-stone-600">
          <FontAwesomeIcon
            icon={faCircleNotch}
            className="h-4 w-4 animate-spin text-stone-400"
          />
          Checking active period for ticket history.
        </div>
      </AppSectionPage>
    );
  }

  if (!hasActivePeriod) {
    return (
      <AppSectionPage
        eyebrow="Tickets"
        title="Ticket history is locked"
        description={
          periodError ||
          "Create an active period first. Ticket history is available only inside the current period."
        }
      >
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-5 text-stone-700">
          No active period found.
        </div>
      </AppSectionPage>
    );
  }

  return (
    <AppSectionPage
      eyebrow="Tickets"
      title="Ticket history"
      description={`All tickets created in ${activePeriod?.name}.`}
      workspaceLabel="Ticket history"
      headerClassName="hidden"
      layoutClassName="print:block"
      workspaceClassName="print:hidden"
      asideClassName="print:block"
      aside={
        <section className="ticket-history-print-shell h-[calc(100vh-8.5rem)] overflow-y-auto rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] print:h-auto print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                Receipt preview
              </p>
              <p className="mt-2 text-lg font-semibold text-stone-950">
                Print-ready
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {selectedTicket ? (
                <Button
                  type="button"
                  variant="outline"
                  className={actionButtonClassName}
                  onClick={() => setShowRefundModal(true)}
                  aria-label="Refund ticket"
                  title="Refund"
                >
                  <FontAwesomeIcon
                    icon={faTriangleExclamation}
                    className="h-3.5 w-3.5"
                  />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className={actionButtonClassName}
                onClick={downloadSelectedTicket}
                disabled={!selectedTicket}
                aria-label="Download receipt"
                title="Download"
              >
                <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className={actionButtonClassName}
                onClick={handlePrintReceipt}
                disabled={!selectedTicket}
                aria-label="Print receipt"
                title="Print"
              >
                <FontAwesomeIcon icon={faPrint} className="h-3.5 w-3.5" />
              </Button>
              {selectedTicket && currentUserState?.user?.role === "admin" ? (
                <Link
                  href={`/admin/audit-logs?related_ticket_number=${selectedTicket.ticket_number}`}
                  className={actionLinkClassName}
                  aria-label="Open ticket audit logs"
                  title="Audit"
                >
                  <FontAwesomeIcon
                    icon={faShieldHalved}
                    className="h-3.5 w-3.5"
                  />
                </Link>
              ) : null}
            </div>
          </div>

          {isDetailLoading ? (
            <div className="mt-5 animate-pulse space-y-3 rounded-[24px] border border-stone-900/8 bg-stone-50 p-5">
              <div className="h-3 w-24 rounded-full bg-stone-200" />
              <div className="h-7 w-40 rounded-full bg-stone-200" />
              <div className="h-3 w-32 rounded-full bg-stone-200" />
              <div className="mt-4 h-48 rounded-[22px] bg-white" />
            </div>
          ) : selectedTicket ? (
            <div className="mt-5">
              <TicketReceiptCard
                ticket={selectedTicket}
                periodName={activePeriod?.name}
                className="receipt-print-card mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0"
              />
            </div>
          ) : (
            <div className="mt-5 rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
              Select a ticket from the history list to open its receipt here.
            </div>
          )}
        </section>
      }
    >
      {toast ? (
        <AdminActionToast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      ) : null}
      <TicketRefundModal
        open={showRefundModal}
        ticket={selectedTicket}
        requireOverrideCode={true}
        adminOverrideCode={adminOverrideCode}
        syncRepeatTicket={syncRepeatTicket}
        busyAction={busyRefundAction}
        onCodeChange={setAdminOverrideCode}
        onSyncRepeatTicketChange={setSyncRepeatTicket}
        onClose={() => {
          setShowRefundModal(false);
          setAdminOverrideCode("");
          setSyncRepeatTicket(false);
        }}
        onRefundTicket={(csoRefundMode) =>
          runTicketRefundAction("refund_ticket", "ticket", undefined, csoRefundMode)
        }
        onRefundTransaction={(transactionId, csoRefundMode) =>
          runTicketRefundAction(
            "refund_transaction",
            "transaction",
            transactionId,
            csoRefundMode,
          )
        }
        onRefundOverflow={(overflowId, csoRefundMode) =>
          runOverflowRefundAction(overflowId, "overflow", csoRefundMode)
        }
      />

      <div className="ticket-history-browser flex h-[calc(100vh-8.5rem)] flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Tickets
            </p>
            <p className="mt-2 text-3xl font-semibold text-stone-950">
              {serverTicketCount}
            </p>
          </div>
          <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Entries
            </p>
            <p className="mt-2 text-3xl font-semibold text-stone-950">
              {serverTotalEntries}
            </p>
          </div>
          <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Total amount
            </p>
            <p className="mt-2 text-3xl font-semibold text-stone-950">
              {formatTicketAmount(serverTotalAmount)}
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5">
          <div className="relative">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by ticket number, customer, or amount"
              className="pl-11"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <label className="flex min-w-0 items-center rounded-[18px] border border-stone-900/10 bg-white px-4">
              <span className="mr-3 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
                Status
              </span>
              <select
                value={refundFilter}
                onChange={(event) => setRefundFilter(event.target.value)}
                className="h-12 w-full bg-transparent text-sm text-stone-700 outline-none"
              >
                <option value="active">Active tickets</option>
                <option value="refunded">Refunded tickets</option>
                <option value="partial">Partial refunds</option>
                <option value="spill_over">Spill over only</option>
                <option value="spill_over_refunded">Spill over refund</option>
              </select>
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
            <label className="flex min-w-0 items-center rounded-[18px] border border-stone-900/10 bg-white px-4">
              <span className="mr-3 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
                Sort
              </span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="h-12 w-full bg-transparent text-sm text-stone-700 outline-none"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="amount_desc">Amount high to low</option>
                <option value="amount_asc">Amount low to high</option>
              </select>
            </label>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="animate-pulse rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4"
                >
                  <div className="h-3 w-20 rounded-full bg-stone-200" />
                  <div className="mt-3 h-5 w-44 rounded-full bg-stone-200" />
                  <div className="mt-3 h-3 w-32 rounded-full bg-stone-200" />
                </div>
              ))}
            </div>
          ) : tickets.length ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
              {groupedTickets.map((group, groupIndex) => (
                <section
                  key={`${group.label}-${groupIndex}`}
                  className="space-y-3"
                >
                  <div className="sticky top-0 rounded-[16px] bg-white/85 px-1 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-400 backdrop-blur">
                    {group.label}
                  </div>
                  {group.tickets.map((ticket) => {
                    const isActive =
                      ticket.ticket_number === selectedTicketNumber;
                    const isPartialRefund =
                      !ticket.is_refunded &&
                      ticket.refunded_transaction_count > 0;
                    const hasSpillOverRefunded =
                      ticket.refunded_spill_over_count > 0;

                    return (
                      <div
                        key={ticket.id}
                        className={`rounded-[22px] border px-4 py-4 transition ${
                          isActive
                            ? "border-stone-950 bg-stone-950 text-white shadow-[0_14px_30px_rgba(28,24,20,0.12)]"
                            : "border-stone-900/8 bg-stone-50 text-stone-900 hover:border-stone-300 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedTicketNumber(ticket.ticket_number)
                            }
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p
                                  className={`text-xs font-semibold uppercase tracking-[0.16em] ${isActive ? "text-stone-300" : "text-stone-400"}`}
                                >
                                  Ticket
                                </p>
                                <p className="mt-2 text-lg font-semibold">
                                  {ticket.ticket_number}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <span
                                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                    isActive
                                      ? "bg-white/10 text-stone-100"
                                      : "bg-white text-stone-500"
                                  }`}
                                >
                                  <FontAwesomeIcon
                                    icon={faTicket}
                                    className="h-3 w-3"
                                  />
                                  {ticket.transaction_count}{" "}
                                  {ticket.transaction_count === 1
                                    ? "entry"
                                    : "entries"}
                                </span>
                                {ticket.is_refunded ? (
                                  <span
                                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                      isActive
                                        ? "bg-emerald-200/20 text-emerald-100"
                                        : "bg-emerald-100 text-emerald-700"
                                    }`}
                                  >
                                    <FontAwesomeIcon
                                      icon={faRotateLeft}
                                      className="h-3 w-3"
                                    />
                                    Refunded
                                  </span>
                                ) : null}
                                {isPartialRefund ? (
                                  <span
                                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                      isActive
                                        ? "bg-sky-200/20 text-sky-100"
                                        : "bg-sky-100 text-sky-700"
                                    }`}
                                  >
                                    <FontAwesomeIcon
                                      icon={faMinusCircle}
                                      className="h-3 w-3"
                                    />
                                    Partial refund
                                  </span>
                                ) : null}
                                {ticket.active_spill_over_count > 0 ? (
                                  <span
                                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                      isActive
                                        ? "bg-amber-200/20 text-amber-100"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    <FontAwesomeIcon
                                      icon={faTriangleExclamation}
                                      className="h-3 w-3"
                                    />
                                    Spill over {ticket.active_spill_over_count}
                                  </span>
                                ) : null}
                                {hasSpillOverRefunded ? (
                                  <span
                                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                      isActive
                                        ? "bg-orange-200/20 text-orange-100"
                                        : "bg-orange-100 text-orange-800"
                                    }`}
                                  >
                                    <FontAwesomeIcon
                                      icon={faRotateLeft}
                                      className="h-3 w-3"
                                    />
                                    Spill over refund
                                  </span>
                                ) : null}
                                {!ticket.is_refunded &&
                                ticket.active_spill_over_count === 0 &&
                                !isPartialRefund ? (
                                  <span
                                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                      isActive
                                        ? "bg-emerald-200/20 text-emerald-100"
                                        : "bg-emerald-100 text-emerald-700"
                                    }`}
                                  >
                                    Clean
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div
                              className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${isActive ? "text-stone-200" : "text-stone-600"}`}
                            >
                              <span className="inline-flex items-center gap-2">
                                <FontAwesomeIcon
                                  icon={faUser}
                                  className={`h-3.5 w-3.5 ${isActive ? "text-stone-300" : "text-stone-400"}`}
                                />
                                {getTicketCustomerDisplayName(
                                  ticket.customer_name,
                                )}
                              </span>
                              <span className="inline-flex items-center gap-2">
                                <FontAwesomeIcon
                                  icon={faReceipt}
                                  className={`h-3.5 w-3.5 ${isActive ? "text-stone-300" : "text-stone-400"}`}
                                />
                                {formatTicketAmount(ticket.total_amount)}
                              </span>
                              <span>{formatTicketDate(ticket.created_at)}</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
              {searchTerm.trim()
                ? "No tickets matched your search in the active period."
                : "No tickets have been created in the active period yet."}
            </div>
          )}

          {serverTotalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              <span>
                Page {currentPage} of {serverTotalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-[16px]"
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-[16px]"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(serverTotalPages, page + 1))
                  }
                  disabled={currentPage === serverTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AppSectionPage>
  );
}
