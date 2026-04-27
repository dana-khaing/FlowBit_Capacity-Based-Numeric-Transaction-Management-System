"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faDownload,
  faMagnifyingGlass,
  faPrint,
  faReceipt,
  faTicket,
  faTriangleExclamation,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import {
  formatTicketDate,
  formatTicketAmount,
  getTicketCustomerDisplayName,
  TicketReceiptCard,
} from "@/components/tickets/ticket-receipt-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePeriodState } from "@/components/period/use-period-state";
import {
  fetchTicketDetail,
  fetchTickets,
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

  function downloadSelectedTicket() {
    if (!selectedTicket) {
      return;
    }

    const receiptLines = selectedTicket.transactions
      .map((transaction, index) => {
        const allocationLines = transaction.allocations
          .map(
            (allocation) =>
              `<li>${allocation.ledger_name}: ${formatTicketAmount(
                allocation.amount ?? allocation.amount_allocated ?? "0.00",
              )}</li>`,
          )
          .join("");

        return `
          <section style="margin-top:16px;padding-top:16px;border-top:1px dashed #c7c2b8;">
            <div style="display:flex;justify-content:space-between;gap:16px;">
              <strong>Entry ${index + 1}</strong>
              <strong>${transaction.identifier_number} ........ ${formatTicketAmount(
                String(Number(transaction.total_amount) * 1.25),
              )}</strong>
            </div>
            ${
              allocationLines
                ? `<div style="margin-top:8px;"><div style="font-size:12px;color:#6b645a;">Ledger allocation</div><ul style="margin:6px 0 0 18px;padding:0;">${allocationLines}</ul></div>`
                : ""
            }
          </section>
        `;
      })
      .join("");

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${selectedTicket.ticket_number}</title>
  </head>
  <body style="font-family: Arial, sans-serif; color:#1c1814; max-width:540px; margin:0 auto; padding:24px;">
    <h1 style="font-size:24px; margin:0;">${selectedTicket.ticket_number}</h1>
    <p style="margin:8px 0 0; color:#6b645a;">${formatTicketDate(selectedTicket.created_at)}</p>
    <p style="margin:4px 0 0; color:#6b645a;">${activePeriod?.name ?? ""}</p>
    <hr style="margin:16px 0; border:none; border-top:1px dashed #c7c2b8;" />
    <p><strong>Entries:</strong> ${selectedTicket.transaction_count}</p>
    <p><strong>Customer:</strong> ${getTicketCustomerDisplayName(selectedTicket.customer_name)}</p>
    <p><strong>Total amount:</strong> ${formatTicketAmount(selectedTicket.total_amount)}</p>
    ${receiptLines}
  </body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedTicket.ticket_number}.html`;
    link.click();
    URL.revokeObjectURL(url);
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
                <Link
                  href={`/spill-over?ticket=${selectedTicket.ticket_number}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[18px] border border-stone-900/10 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                >
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5" />
                  Refund
                </Link>
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

      <div className="space-y-5">
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
              {paginatedTickets.map((ticket) => {
                const isActive = ticket.ticket_number === selectedTicketNumber;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicketNumber(ticket.ticket_number)}
                    className={`block w-full rounded-[22px] border px-4 py-4 text-left transition ${
                      isActive
                        ? "border-stone-950 bg-stone-950 text-white shadow-[0_14px_30px_rgba(28,24,20,0.12)]"
                        : "border-stone-900/8 bg-stone-50 text-stone-900 hover:border-stone-300 hover:bg-white"
                    }`}
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
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                            isActive ? "bg-emerald-200/20 text-emerald-100" : "bg-emerald-100 text-emerald-700"
                          }`}>
                            Refunded
                          </span>
                        ) : null}
                        {ticket.has_spill_over ? (
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                            isActive ? "bg-amber-200/20 text-amber-100" : "bg-amber-100 text-amber-800"
                          }`}>
                            Spill over
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
                );
              })}
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
