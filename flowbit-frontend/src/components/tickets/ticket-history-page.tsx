"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckSquare,
  faCircleNotch,
  faDownload,
  faMagnifyingGlass,
  faMinusCircle,
  faPrint,
  faReceipt,
  faRotateLeft,
  faShieldHalved,
  faSquare,
  faTicket,
  faTriangleExclamation,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
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
import { usePeriodState } from "@/components/period/use-period-state";
import { getStoredUser } from "@/lib/auth-client";
import {
  fetchTicketDetail,
  fetchTickets,
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
  const pageSize = 12;
  const [tickets, setTickets] = useState<FlowBitTicketListItem[]>([]);
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<FlowBitTicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [adminOverrideCode, setAdminOverrideCode] = useState("");
  const [selectedTicketNumbers, setSelectedTicketNumbers] = useState<string[]>([]);
  const [busyRefundAction, setBusyRefundAction] = useState<null | {
    kind: "ticket" | "transaction" | "overflow";
    id: number;
  }>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const deferredCustomerFilter = useDeferredValue(customerFilter);
  const {
    activePeriod,
    hasActivePeriod,
    isLoading: isPeriodLoading,
    error: periodError,
  } = usePeriodState();

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

    fetchTickets({ periodId: activePeriod.id })
      .then((nextTickets) => {
        if (!isMounted) {
          return;
        }
        setTickets(nextTickets);
        setSelectedTicketNumbers((current) =>
          current.filter((ticketNumber) =>
            nextTickets.some((ticket) => ticket.ticket_number === ticketNumber),
          ),
        );
        setSelectedTicketNumber((current) =>
          current && nextTickets.some((ticket) => ticket.ticket_number === current)
            ? current
            : nextTickets[0]?.ticket_number ?? null,
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
  }, [activePeriod?.id, hasActivePeriod]);

  useEffect(() => {
    setSelectedTicketNumbers([]);
  }, [activePeriod?.id]);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
    const normalizedCustomer = deferredCustomerFilter.trim().toLowerCase();

    const filtered = tickets.filter((ticket) => {
      const ticketDate = new Date(ticket.created_at);
      const matchesSearch =
        !normalizedSearch ||
        [
          ticket.ticket_number,
          ticket.customer_name || "",
          ticket.total_amount,
          ...(ticket.identifier_numbers || []),
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(normalizedSearch),
        );

      const matchesCustomer =
        !normalizedCustomer ||
        String(ticket.customer_name ?? "")
          .toLowerCase()
          .includes(normalizedCustomer);

      const matchesDateFrom =
        !dateFrom || ticketDate >= new Date(`${dateFrom}T00:00:00`);
      const matchesDateTo =
        !dateTo || ticketDate <= new Date(`${dateTo}T23:59:59`);

      return matchesSearch && matchesCustomer && matchesDateFrom && matchesDateTo;
    });

    return filtered.slice().sort((left, right) => {
      if (sortBy === "oldest") {
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      }

      if (sortBy === "amount_desc") {
        return Number(right.total_amount) - Number(left.total_amount);
      }

      if (sortBy === "amount_asc") {
        return Number(left.total_amount) - Number(right.total_amount);
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  }, [dateFrom, dateTo, deferredCustomerFilter, deferredSearchTerm, sortBy, tickets]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const paginatedTickets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [currentPage, filteredTickets]);

  const groupedTickets = useMemo(() => {
    const groups: Array<{ label: string; tickets: FlowBitTicketListItem[] }> = [];
    for (const ticket of paginatedTickets) {
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
  }, [paginatedTickets]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredCustomerFilter, deferredSearchTerm, dateFrom, dateTo, sortBy]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!paginatedTickets.length) {
      setSelectedTicketNumber(null);
      setSelectedTicket(null);
      return;
    }

    if (!selectedTicketNumber || !paginatedTickets.some((ticket) => ticket.ticket_number === selectedTicketNumber)) {
      setSelectedTicketNumber(paginatedTickets[0].ticket_number);
    }
  }, [paginatedTickets, selectedTicketNumber]);

  async function downloadSelectedTicket() {
    if (!selectedTicket) {
      return;
    }
    try {
      const blob = await downloadTicketReceiptPdf([selectedTicket.ticket_number]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedTicket.ticket_number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    }
  }

  async function downloadSelectedTickets() {
    if (!selectedTicketNumbers.length) {
      return;
    }
    try {
      const blob = await downloadTicketReceiptPdf(selectedTicketNumbers);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        selectedTicketNumbers.length === 1
          ? `${selectedTicketNumbers[0]}.pdf`
          : `tickets_${selectedTicketNumbers.length}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    }
  }

  async function printSelectedTickets() {
    if (!selectedTicketNumbers.length) {
      return;
    }
    try {
      const details = await Promise.all(
        selectedTicketNumbers.map((ticketNumber) => fetchTicketDetail(ticketNumber)),
      );
      const receipts = details
        .map((ticket) => {
          const visibleTransactions = ticket.transactions.filter((transaction) => !transaction.is_refunded);
          const visibleTotalAmount = visibleTransactions.reduce((sum, transaction) => {
            const amount = Number(transaction.total_amount);
            return sum + (Number.isNaN(amount) ? 0 : amount);
          }, 0);
          const rows = visibleTransactions
            .map((transaction) => {
              const activeOverflowAmount = transaction.overflows
                .filter((overflow) => overflow.status !== "RFND")
                .reduce((sum, overflow) => sum + Number(getOverflowDisplayAmount(overflow) || 0), 0);
              const activeAllocationAmount = transaction.allocations
                .reduce((sum, allocation) => sum + Number(allocation.amount ?? allocation.amount_allocated ?? 0), 0);
              const lineAmount = activeOverflowAmount + activeAllocationAmount > 0
                ? activeOverflowAmount + activeAllocationAmount
                : Number(transaction.total_amount) * 1.25;
              return `<div style="display:flex;justify-content:space-between;gap:16px;padding-top:12px;margin-top:12px;border-top:1px dashed #c7c2b8;"><strong>${transaction.identifier_number}</strong><strong>${formatTicketAmount(String(lineAmount))}</strong></div>`;
            })
            .join("");
          return `
            <section style="break-after:page;max-width:540px;margin:0 auto 28px;padding:24px;color:#1c1814;font-family:Arial,sans-serif;">
              <h1 style="font-size:24px;margin:0;">${ticket.ticket_number}</h1>
              <p style="margin:8px 0 0;color:#6b645a;">${formatTicketDate(ticket.created_at)}</p>
              <p style="margin:4px 0 0;color:#6b645a;">${activePeriod?.name ?? ""}</p>
              <hr style="margin:16px 0;border:none;border-top:1px dashed #c7c2b8;" />
              <p><strong>Entries:</strong> ${visibleTransactions.length}</p>
              <p><strong>Customer:</strong> ${getTicketCustomerDisplayName(ticket.customer_name)}</p>
              <p><strong>Total amount:</strong> ${formatTicketAmount(String(visibleTotalAmount))}</p>
              ${rows}
            </section>
          `;
        })
        .join("");

      const printWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!printWindow) {
        setToast({ type: "error", message: "Unable to open print window." });
        return;
      }
      printWindow.document.write(`<!doctype html><html><head><title>Ticket receipts</title></head><body>${receipts}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    }
  }

  async function refreshTicketHistoryState() {
    if (activePeriod) {
      const nextTickets = await fetchTickets({ periodId: activePeriod.id });
      setTickets(nextTickets);
    }
    if (selectedTicketNumber) {
      const detail = await fetchTicketDetail(selectedTicketNumber);
      setSelectedTicket(detail);
    }
  }

  async function runOverflowRefundAction(
    overflowId: number,
    kind: "overflow",
  ) {
    const user = getStoredUser();
    const requireOverrideCode = user?.role !== "admin";
    if (requireOverrideCode && !adminOverrideCode.trim()) {
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
      });
      await refreshTicketHistoryState();
      setToast({
        type: "success",
        message: response.message || "Refund completed.",
      });
      setShowRefundModal(false);
      setAdminOverrideCode("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setBusyRefundAction(null);
    }
  }

  async function runTicketRefundAction(
    action: "refund_ticket" | "refund_transaction",
    kind: "ticket" | "transaction",
    transactionId?: number,
  ) {
    if (!selectedTicketNumber) {
      return;
    }

    const user = getStoredUser();
    const requireOverrideCode = user?.role !== "admin";
    if (requireOverrideCode && !adminOverrideCode.trim()) {
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
      });
      await refreshTicketHistoryState();
      setToast({
        type: "success",
        message: response.message || "Refund completed.",
      });
      setShowRefundModal(false);
      setAdminOverrideCode("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
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

  const totalAmount = useMemo(
    () =>
      tickets.reduce((sum, ticket) => {
        const amount = Number(ticket.total_amount);
        return sum + (Number.isNaN(amount) ? 0 : amount);
      }, 0),
    [tickets],
  );

  const totalEntries = useMemo(
    () => tickets.reduce((sum, ticket) => sum + ticket.transaction_count, 0),
    [tickets],
  );

  function toggleTicketSelection(ticketNumber: string) {
    setSelectedTicketNumbers((current) =>
      current.includes(ticketNumber)
        ? current.filter((value) => value !== ticketNumber)
        : [...current, ticketNumber],
    );
  }

  function togglePageSelection() {
    const pageNumbers = paginatedTickets.map((ticket) => ticket.ticket_number);
    const allSelected = pageNumbers.every((ticketNumber) => selectedTicketNumbers.includes(ticketNumber));
    setSelectedTicketNumbers((current) =>
      allSelected
        ? current.filter((ticketNumber) => !pageNumbers.includes(ticketNumber))
        : Array.from(new Set([...current, ...pageNumbers])),
    );
  }

  useEffect(() => {
    if (!paginatedTickets.length) {
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
      const currentIndex = paginatedTickets.findIndex(
        (ticket) => ticket.ticket_number === selectedTicketNumber,
      );
      const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(fallbackIndex + 1, paginatedTickets.length - 1)
          : Math.max(fallbackIndex - 1, 0);

      setSelectedTicketNumber(paginatedTickets[nextIndex].ticket_number);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paginatedTickets, selectedTicketNumber]);

  if (isPeriodLoading) {
    return (
      <AppSectionPage
        eyebrow="Tickets"
        title="Ticket history"
        description="Review every ticket created in the active period."
      >
        <div className="inline-flex items-center gap-3 rounded-full border border-stone-900/8 bg-stone-50 px-5 py-3 text-sm font-medium text-stone-600">
          <FontAwesomeIcon icon={faCircleNotch} className="h-4 w-4 animate-spin text-stone-400" />
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
        <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                Ticket view
              </p>
              <p className="mt-2 text-lg font-semibold text-stone-950">
                Receipt layout
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {selectedTicket ? (
                <button
                  type="button"
                  onClick={() => setShowRefundModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-stone-900/10 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950/20"
                >
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5" />
                  Refund
                </button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="rounded-[18px]"
                onClick={downloadSelectedTicket}
                disabled={!selectedTicket}
              >
                <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
                Download
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-[18px]"
                onClick={() => window.print()}
                disabled={!selectedTicket}
              >
                <FontAwesomeIcon icon={faPrint} className="h-3.5 w-3.5" />
                Print
              </Button>
              {selectedTicket && getStoredUser()?.role === "admin" ? (
                <Link
                  href={`/admin/audit-logs?target_model=ticket&target_id=${selectedTicket.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-stone-900/10 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                >
                  <FontAwesomeIcon icon={faShieldHalved} className="h-3.5 w-3.5" />
                  Audit
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
                className="mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0"
              />
            </div>
          ) : (
            <div className="mt-5 rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
              Select a ticket from the workspace list to open its receipt view here.
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
        requireOverrideCode={getStoredUser()?.role !== "admin"}
        adminOverrideCode={adminOverrideCode}
        busyAction={busyRefundAction}
        onCodeChange={setAdminOverrideCode}
        onClose={() => {
          setShowRefundModal(false);
          setAdminOverrideCode("");
        }}
        onRefundTicket={() =>
          runTicketRefundAction("refund_ticket", "ticket")
        }
        onRefundTransaction={(transactionId) =>
          runTicketRefundAction("refund_transaction", "transaction", transactionId)
        }
        onRefundOverflow={(overflowId) =>
          runOverflowRefundAction(overflowId, "overflow")
        }
      />

        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePageSelection}
                className="inline-flex items-center gap-2 font-medium text-stone-700"
              >
                <FontAwesomeIcon
                  icon={
                    paginatedTickets.length &&
                    paginatedTickets.every((ticket) => selectedTicketNumbers.includes(ticket.ticket_number))
                      ? faCheckSquare
                      : faSquare
                  }
                  className="h-4 w-4"
                />
                Select page
              </button>
              <span>{selectedTicketNumbers.length} selected</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-[16px]"
                onClick={printSelectedTickets}
                disabled={!selectedTicketNumbers.length}
              >
                Print selected
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-[16px]"
                onClick={downloadSelectedTickets}
                disabled={!selectedTicketNumbers.length}
              >
                Download selected
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Tickets
            </p>
            <p className="mt-2 text-3xl font-semibold text-stone-950">{tickets.length}</p>
          </div>
          <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Entries
            </p>
            <p className="mt-2 text-3xl font-semibold text-stone-950">{totalEntries}</p>
          </div>
          <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Total amount
            </p>
            <p className="mt-2 text-3xl font-semibold text-stone-950">
              {formatTicketAmount(String(totalAmount))}
            </p>
          </div>
        </div>

        <div className="space-y-5">
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

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
              placeholder="Filter by customer"
            />
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
            <label className="flex items-center rounded-[18px] border border-stone-900/10 bg-white px-4">
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
          ) : paginatedTickets.length ? (
            <div className="space-y-3">
              {groupedTickets.map((group, groupIndex) => (
                <section key={`${group.label}-${groupIndex}`} className="space-y-3">
                  <div className="sticky top-0 rounded-[16px] bg-white/85 px-1 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-400 backdrop-blur">
                    {group.label}
                  </div>
                  {group.tickets.map((ticket) => {
                    const isActive = ticket.ticket_number === selectedTicketNumber;
                    const isSelected = selectedTicketNumbers.includes(ticket.ticket_number);
                    const isPartialRefund =
                      !ticket.is_refunded && ticket.refunded_transaction_count > 0;

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
                            onClick={() => toggleTicketSelection(ticket.ticket_number)}
                            className={`mt-1 inline-flex h-5 w-5 items-center justify-center rounded border ${
                              isActive
                                ? "border-white/40 bg-white/10 text-white"
                                : "border-stone-300 bg-white text-stone-500"
                            }`}
                            aria-label={`Select ${ticket.ticket_number}`}
                          >
                            <FontAwesomeIcon icon={isSelected ? faCheckSquare : faSquare} className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedTicketNumber(ticket.ticket_number)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${isActive ? "text-stone-300" : "text-stone-400"}`}>
                                  Ticket
                                </p>
                                <p className="mt-2 text-lg font-semibold">{ticket.ticket_number}</p>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                  isActive ? "bg-white/10 text-stone-100" : "bg-white text-stone-500"
                                }`}>
                                  <FontAwesomeIcon icon={faTicket} className="h-3 w-3" />
                                  {ticket.transaction_count} {ticket.transaction_count === 1 ? "entry" : "entries"}
                                </span>
                                {ticket.is_refunded ? (
                                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                    isActive ? "bg-emerald-200/20 text-emerald-100" : "bg-emerald-100 text-emerald-700"
                                  }`}>
                                    <FontAwesomeIcon icon={faRotateLeft} className="h-3 w-3" />
                                    Refunded
                                  </span>
                                ) : null}
                                {isPartialRefund ? (
                                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                    isActive ? "bg-sky-200/20 text-sky-100" : "bg-sky-100 text-sky-700"
                                  }`}>
                                    <FontAwesomeIcon icon={faMinusCircle} className="h-3 w-3" />
                                    Partial refund
                                  </span>
                                ) : null}
                                {ticket.active_spill_over_count > 0 ? (
                                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                    isActive ? "bg-amber-200/20 text-amber-100" : "bg-amber-100 text-amber-800"
                                  }`}>
                                    <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                                    Spill over {ticket.active_spill_over_count}
                                  </span>
                                ) : null}
                                {!ticket.is_refunded && ticket.active_spill_over_count === 0 && !isPartialRefund ? (
                                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                    isActive ? "bg-emerald-200/20 text-emerald-100" : "bg-emerald-100 text-emerald-700"
                                  }`}>
                                    Clean
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${isActive ? "text-stone-200" : "text-stone-600"}`}>
                              <span className="inline-flex items-center gap-2">
                                <FontAwesomeIcon icon={faUser} className={`h-3.5 w-3.5 ${isActive ? "text-stone-300" : "text-stone-400"}`} />
                                {getTicketCustomerDisplayName(ticket.customer_name)}
                              </span>
                              <span className="inline-flex items-center gap-2">
                                <FontAwesomeIcon icon={faReceipt} className={`h-3.5 w-3.5 ${isActive ? "text-stone-300" : "text-stone-400"}`} />
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

          {filteredTickets.length > pageSize ? (
            <div className="flex items-center justify-between gap-3 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-[16px]"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-[16px]"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
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
