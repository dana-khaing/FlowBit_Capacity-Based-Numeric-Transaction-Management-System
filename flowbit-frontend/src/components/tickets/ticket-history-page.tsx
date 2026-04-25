"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faMagnifyingGlass,
  faReceipt,
  faTicket,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { Input } from "@/components/ui/input";
import { usePeriodState } from "@/components/period/use-period-state";
import { fetchTickets, type FlowBitTicketListItem } from "@/lib/ticket-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function formatAmount(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }

  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function TicketHistoryPage() {
  const [tickets, setTickets] = useState<FlowBitTicketListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    fetchTickets({ periodId: activePeriod.id })
      .then((nextTickets) => {
        if (isMounted) {
          setTickets(nextTickets);
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
      ].some((value) => value.toLowerCase().includes(normalizedSearch)),
    );
  }, [deferredSearchTerm, tickets]);

  const totalAmount = useMemo(
    () =>
      tickets.reduce((sum, ticket) => {
        const amount = Number(ticket.total_amount);
        return sum + (Number.isNaN(amount) ? 0 : amount);
      }, 0),
    [tickets],
  );

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
            <p className="mt-2 text-3xl font-semibold text-stone-950">
              {tickets.reduce((sum, ticket) => sum + ticket.transaction_count, 0)}
            </p>
          </div>
          <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Total amount
            </p>
            <p className="mt-2 text-3xl font-semibold text-stone-950">
              {formatAmount(String(totalAmount))}
            </p>
          </div>
        </div>

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
            {filteredTickets.map((ticket) => (
              <article
                key={ticket.id}
                className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                      Ticket
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      {ticket.ticket_number}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    <FontAwesomeIcon icon={faTicket} className="h-3 w-3" />
                    {ticket.transaction_count} {ticket.transaction_count === 1 ? "entry" : "entries"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-600">
                  <span className="inline-flex items-center gap-2">
                    <FontAwesomeIcon icon={faUser} className="h-3.5 w-3.5 text-stone-400" />
                    {ticket.customer_name || "Walk-in Customer"}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <FontAwesomeIcon icon={faReceipt} className="h-3.5 w-3.5 text-stone-400" />
                    {formatAmount(ticket.total_amount)}
                  </span>
                  <span>
                    {new Date(ticket.created_at).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
            {searchTerm.trim()
              ? "No tickets matched your search in the active period."
              : "No tickets have been created in the active period yet."}
          </div>
        )}
      </div>
    </AppSectionPage>
  );
}
