"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlowBitTicketDetail } from "@/lib/ticket-client";

type TicketRefundModalProps = {
  open: boolean;
  ticket: FlowBitTicketDetail | null;
  requireOverrideCode: boolean;
  adminOverrideCode: string;
  busyAction:
    | null
    | { kind: "ticket"; id: number }
    | { kind: "transaction"; id: number }
    | { kind: "overflow"; id: number };
  onCodeChange: (value: string) => void;
  onClose: () => void;
  onRefundTicket: (overflowId: number) => void;
  onRefundTransaction: (overflowId: number) => void;
  onRefundOverflow: (overflowId: number) => void;
};

function formatAmount(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }

  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function TicketRefundModal({
  open,
  ticket,
  requireOverrideCode,
  adminOverrideCode,
  busyAction,
  onCodeChange,
  onClose,
  onRefundTicket,
  onRefundTransaction,
  onRefundOverflow,
}: TicketRefundModalProps) {
  if (!open || !ticket) {
    return null;
  }

  const transactionsWithOverflow = ticket.transactions.filter(
    (transaction) =>
      transaction.overflows.some((overflow) => overflow.status !== "RFND") &&
      !transaction.is_refunded,
  );
  const activeOverflows = transactionsWithOverflow.flatMap((transaction) =>
    transaction.overflows
      .filter((overflow) => overflow.status !== "RFND")
      .map((overflow) => ({
        ...overflow,
        transactionOrderNumber: transaction.order_number,
        identifierNumber: transaction.identifier_number,
      })),
  );
  const firstOverflowId = activeOverflows[0]?.id ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          Refund
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">
          {ticket.ticket_number}
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Choose whether to refund the full ticket, a transaction, or a single spill-over item.
        </p>

        {requireOverrideCode ? (
          <label className="mt-5 block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
              Admin override code
            </span>
            <Input
              type="password"
              value={adminOverrideCode}
              onChange={(event) => onCodeChange(event.target.value)}
              placeholder="Enter override code"
              disabled={Boolean(busyAction)}
            />
          </label>
        ) : null}

        {firstOverflowId ? (
          <div className="mt-5 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-900">Full ticket</p>
                <p className="mt-1 text-sm text-stone-500">
                  Refund every transaction and spill-over entry in this ticket.
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-[18px]"
                onClick={() => onRefundTicket(firstOverflowId)}
                disabled={Boolean(busyAction)}
              >
                {busyAction?.kind === "ticket" ? "Refunding..." : "Refund ticket"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
            No active spill-over entries are available for refund on this ticket.
          </div>
        )}

        {transactionsWithOverflow.length ? (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Transaction refunds
            </p>
            {transactionsWithOverflow.map((transaction) => {
              const overflow = transaction.overflows.find((item) => item.status !== "RFND");
              if (!overflow) {
                return null;
              }

              return (
                <div
                  key={transaction.id}
                  className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-900">
                        {transaction.identifier_number} ........ {formatAmount(transaction.total_amount)}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {transaction.order_number}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="rounded-[18px]"
                      onClick={() => onRefundTransaction(overflow.id)}
                      disabled={Boolean(busyAction)}
                    >
                      {busyAction?.kind === "transaction" &&
                      busyAction.id === overflow.id
                        ? "Refunding..."
                        : "Refund transaction"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {activeOverflows.length ? (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Spill-over refunds
            </p>
            {activeOverflows.map((overflow) => (
              <div
                key={overflow.id}
                className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-stone-900">
                      {overflow.identifierNumber} spill over {formatAmount(
                        overflow.excess_amount || overflow.amount_to_approve || "0",
                      )}
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      {overflow.transactionOrderNumber} · {overflow.status}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-[18px]"
                    onClick={() => onRefundOverflow(overflow.id)}
                    disabled={Boolean(busyAction)}
                  >
                    {busyAction?.kind === "overflow" && busyAction.id === overflow.id
                      ? "Refunding..."
                      : "Refund spill over"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={onClose} disabled={Boolean(busyAction)}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
