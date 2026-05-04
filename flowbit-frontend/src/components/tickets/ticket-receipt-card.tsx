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

function isVisibleReceiptSpillOver(
  overflow: FlowBitTicketDetail["transactions"][number]["overflows"][number],
) {
  return (
    overflow.status !== "RFND" &&
    overflow.status !== "OVRK" &&
    overflow.resolution_type !== "RESERVE_CONSUMED"
  );
}

function hasPendingReceiptSpillOver(
  transaction: FlowBitTicketDetail["transactions"][number],
) {
  return transaction.overflows.some(
    (overflow) => isVisibleReceiptSpillOver(overflow) && overflow.status === "TCSO",
  );
}

function getActiveOverflowAmount(
  transaction: FlowBitTicketDetail["transactions"][number],
) {
  return transaction.overflows
    .filter(isVisibleReceiptSpillOver)
    .reduce((sum, overflow) => {
      const amount = Number(getOverflowDisplayAmount(overflow));
      return sum + (Number.isNaN(amount) ? 0 : amount);
    }, 0);
}

function getActiveAllocatedAmount(
  transaction: FlowBitTicketDetail["transactions"][number],
) {
  return transaction.allocations.reduce((sum, allocation) => {
    const amount = Number(allocation.amount ?? allocation.amount_allocated ?? "0");
    return sum + (Number.isNaN(amount) ? 0 : amount);
  }, 0);
}

function getVisibleLineAmount(
  transaction: FlowBitTicketDetail["transactions"][number],
) {
  const activeAmount = getActiveAllocatedAmount(transaction) + getActiveOverflowAmount(transaction);
  if (activeAmount > 0) {
    return activeAmount.toFixed(2);
  }

  return getTicketBasisAmount(transaction);
}

export function getOverflowDisplayAmount(
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
  const visibleTransactions = ticket.transactions.filter(
    (transaction) => !transaction.is_refunded,
  );
  const visibleTransactionCount = visibleTransactions.length;
  const refundedTransactions = ticket.transactions.filter(
    (transaction) => transaction.is_refunded,
  );
  const refundedOverflows = visibleTransactions.flatMap((transaction) =>
    transaction.overflows
      .filter((overflow) => overflow.status === "RFND")
      .map((overflow) => ({
        id: overflow.id,
        identifierNumber: transaction.identifier_number,
        amount: overflow.refund_amount || overflow.excess_amount || overflow.amount_to_approve || "0.00",
      })),
  );

  return (
    <div
      className={
        className ||
        "receipt-print-card mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900"
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

      <div className="grid gap-3 border-b border-dashed border-stone-300 py-4 text-sm md:grid-cols-4 print:grid-cols-2">
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
          <p className="mt-2 font-medium text-stone-950">{visibleTransactionCount}</p>
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
        {visibleTransactions.map((transaction, index) => (
          <div
            key={transaction.id}
            className="border-b border-dashed border-stone-300 pb-4 last:border-b-0 last:pb-0"
          >
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Entry {index + 1}
              </p>
              <div className="flex items-end gap-2">
                <span className="text-lg font-semibold tracking-[0.18em] text-stone-950">
                  {transaction.identifier_number}
                </span>
                <span className="mb-1 min-w-[48px] flex-1 border-b border-dotted border-stone-300" />
                <p className="text-base font-semibold text-stone-950">
                  {formatTicketAmount(getVisibleLineAmount(transaction))}
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

            {transaction.overflows.filter(isVisibleReceiptSpillOver).length ? (
              <div
                className={`mt-3 rounded-[18px] px-3 py-3 text-sm print:hidden ${
                  hasPendingReceiptSpillOver(transaction)
                    ? "border border-amber-200 bg-amber-50 text-amber-800"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                    hasPendingReceiptSpillOver(transaction)
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }`}
                >
                  Spill over
                </p>
                <div className="mt-2 space-y-2">
                  {transaction.overflows
                    .filter(isVisibleReceiptSpillOver)
                    .map((overflow) => (
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

      {refundedTransactions.length ? (
        <div className="border-t border-dashed border-stone-300 pt-4 print:hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Refunded entries
          </p>
          <div className="mt-3 space-y-3">
            {refundedTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="rounded-[18px] border border-stone-200 bg-stone-100/80 px-3 py-3 text-sm text-stone-500"
              >
                <div className="flex items-end gap-2">
                  <span className="font-semibold tracking-[0.18em] text-stone-700">
                    {transaction.identifier_number}
                  </span>
                  <span className="mb-1 min-w-[48px] flex-1 border-b border-dotted border-stone-300" />
                  <span className="font-semibold text-stone-700">
                    {formatTicketAmount(getTicketBasisAmount(transaction))}
                  </span>
                </div>
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-stone-400">
                  Refunded
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {refundedOverflows.length ? (
        <div className="border-t border-dashed border-stone-300 pt-4 print:hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Refunded spill over
          </p>
          <div className="mt-3 space-y-3">
            {refundedOverflows.map((overflow) => (
              <div
                key={overflow.id}
                className="rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
              >
                <div className="flex items-end gap-2">
                  <span className="font-semibold tracking-[0.18em] text-amber-900">
                    {overflow.identifierNumber}
                  </span>
                  <span className="mb-1 min-w-[48px] flex-1 border-b border-dotted border-amber-300" />
                  <span className="font-semibold text-amber-900">
                    {formatTicketAmount(overflow.amount)}
                  </span>
                </div>
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-amber-700">
                  Refunded
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
