"use client";

import { type FlowBitTicketDetail } from "@/lib/ticket-client";

export function formatTicketAmount(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }

  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatTicketDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getTicketCustomerDisplayName(value: string | null | undefined) {
  const normalized = value?.trim() || "";
  if (!normalized) {
    return "-";
  }

  return normalized.startsWith("Walk-in ") ? "-" : normalized;
}

function getTicketBasisAmount(
  transaction: FlowBitTicketDetail["transactions"][number],
) {
  const amount = Number(transaction.total_amount);
  if (Number.isNaN(amount) || amount <= 0) {
    return "0.00";
  }

  return (amount * 1.25).toFixed(2);
}

function getOverflowDisplayAmount(
  overflow: FlowBitTicketDetail["transactions"][number]["overflows"][number],
) {
  if (overflow.status === "TCSO") {
    return overflow.excess_amount || "0.00";
  }

  const approved = Number(overflow.amount_to_approve || "0");
  if (approved > 0) {
    return overflow.amount_to_approve;
  }

  return overflow.excess_amount || overflow.amount_to_approve || "0.00";
}

type TicketReceiptCardProps = {
  ticket: FlowBitTicketDetail;
  periodName?: string | null;
  className?: string;
};

export function TicketReceiptCard({
  ticket,
  periodName,
  className,
}: TicketReceiptCardProps) {
  return (
    <div
      className={
        className ||
        "mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900"
      }
    >
      <div className="border-b border-dashed border-stone-300 pb-4 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
          FlowBit receipt
        </p>
        <p className="mt-3 text-2xl font-semibold">{ticket.ticket_number}</p>
        <p className="mt-2 text-sm text-stone-500">
          {formatTicketDate(ticket.created_at)}
        </p>
        {periodName ? (
          <p className="mt-1 text-sm text-stone-500">{periodName}</p>
        ) : null}
      </div>

      <div className="grid gap-3 border-b border-dashed border-stone-300 py-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Ticket No
          </p>
          <p className="mt-2 font-medium text-stone-950">{ticket.ticket_number}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Entries
          </p>
          <p className="mt-2 font-medium text-stone-950">{ticket.transaction_count}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Customer name
          </p>
          <p className="mt-2 font-medium text-stone-950">
            {getTicketCustomerDisplayName(ticket.customer_name)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Total amount
          </p>
          <p className="mt-2 font-medium text-stone-950">
            {formatTicketAmount(ticket.total_amount)}
          </p>
        </div>
      </div>

      <div className="space-y-4 py-4">
        {ticket.transactions.map((transaction, index) => (
          <div
            key={transaction.id}
            className="border-b border-dashed border-stone-300 pb-4 last:border-b-0 last:pb-0"
          >
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Entry {index + 1}
              </p>
              <div className="flex items-end gap-3">
                <span className="text-lg font-semibold tracking-[0.18em] text-stone-950">
                  {transaction.identifier_number}
                </span>
                <span className="mb-1 flex-1 border-b border-dotted border-stone-300" />
                <p className="text-base font-semibold text-stone-950">
                  {formatTicketAmount(getTicketBasisAmount(transaction))}
                </p>
              </div>
            </div>

            {transaction.allocations.length ? (
              <div className="mt-3 rounded-[18px] bg-white px-3 py-3 text-sm text-stone-600 print:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  Ledger allocation
                </p>
                <div className="mt-2 space-y-2">
                  {transaction.allocations.map((allocation) => (
                    <div
                      key={allocation.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>{allocation.ledger_name}</span>
                      <span className="font-medium text-stone-900">
                        {formatTicketAmount(
                          allocation.amount ?? allocation.amount_allocated ?? "0.00",
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {transaction.overflows.length ? (
              <div className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 print:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                  Spill over
                </p>
                <div className="mt-2 space-y-2">
                  {transaction.overflows.map((overflow) => (
                    <div
                      key={overflow.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>{overflow.status.replaceAll("_", " ")}</span>
                      <span className="font-medium">
                        {formatTicketAmount(getOverflowDisplayAmount(overflow))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {ticket.notes ? (
        <div className="border-t border-dashed border-stone-300 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Notes
          </p>
          <p className="mt-2 text-sm text-stone-600">{ticket.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
