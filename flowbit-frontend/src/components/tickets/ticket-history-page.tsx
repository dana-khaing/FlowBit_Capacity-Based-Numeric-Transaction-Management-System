"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faMagnifyingGlass,
  faPrint,
  faReceipt,
  faTicket,
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
  const [tickets, setTickets] = useState<FlowBitTicketListItem[]>([]);
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<FlowBitTicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);
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
    if (!normalizedSearch) {
      return tickets;
    }

    return tickets.filter((ticket) =>
      [
        ticket.ticket_number,
        ticket.customer_name || "",
        ticket.total_amount,
        ...(ticket.identifier_numbers || []),
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(normalizedSearch),
      ),
    );
  }, [deferredSearchTerm, tickets]);

  useEffect(() => {
    if (!filteredTickets.length) {
      setSelectedTicketNumber(null);
      setSelectedTicket(null);
      return;
    }

    if (!selectedTicketNumber || !filteredTickets.some((ticket) => ticket.ticket_number === selectedTicketNumber)) {
      setSelectedTicketNumber(filteredTickets[0].ticket_number);
    }
  }, [filteredTickets, selectedTicketNumber]);

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
    if (!filteredTickets.length) {
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
      const currentIndex = filteredTickets.findIndex(
        (ticket) => ticket.ticket_number === selectedTicketNumber,
      );
      const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(fallbackIndex + 1, filteredTickets.length - 1)
          : Math.max(fallbackIndex - 1, 0);

      setSelectedTicketNumber(filteredTickets[nextIndex].ticket_number);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredTickets, selectedTicketNumber]);

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
            <Button
              type="button"
              variant="outline"
              className="rounded-[18px] print:hidden"
              onClick={() => window.print()}
              disabled={!selectedTicket}
            >
              <FontAwesomeIcon icon={faPrint} className="h-3.5 w-3.5" />
              Print
            </Button>
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
          ) : filteredTickets.length ? (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => {
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
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                        isActive ? "bg-white/10 text-stone-100" : "bg-white text-stone-500"
                      }`}>
                        <FontAwesomeIcon icon={faTicket} className="h-3 w-3" />
                        {ticket.transaction_count} {ticket.transaction_count === 1 ? "entry" : "entries"}
                      </span>
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
        </div>
      </div>
    </AppSectionPage>
  );
}
