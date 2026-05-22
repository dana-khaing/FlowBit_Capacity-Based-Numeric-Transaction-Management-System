"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlowBitTicketDetail } from "@/lib/ticket-client";

type TicketRefundModalProps = {
  open: boolean;
  ticket: FlowBitTicketDetail | null;
  requireOverrideCode: boolean;
  adminOverrideCode: string;
  syncRepeatTicket: boolean;
  busyAction:
    | null
    | { kind: "ticket"; id: number }
    | { kind: "transaction"; id: number }
    | { kind: "overflow"; id: number };
  onCodeChange: (value: string) => void;
  onSyncRepeatTicketChange: (value: boolean) => void;
  onClose: () => void;
  onRefundTicket: () => void;
  onRefundTransaction: (transactionId: number) => void;
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

type ConfirmRefundAction =
  | { kind: "ticket"; label: string }
  | { kind: "transaction"; id: number; label: string }
  | { kind: "overflow"; id: number; label: string };

export function TicketRefundModal({
  open,
  ticket,
  requireOverrideCode,
  adminOverrideCode,
  syncRepeatTicket,
  busyAction,
  onCodeChange,
  onSyncRepeatTicketChange,
  onClose,
  onRefundTicket,
  onRefundTransaction,
  onRefundOverflow,
}: TicketRefundModalProps) {
  if (!open || !ticket) {
    return null;
  }

  const refundableTransactions = ticket.transactions.filter(
    (transaction) => !transaction.is_refunded,
  );
  const showTransactionRefunds = refundableTransactions.length > 1;
  const activeOverflows = ticket.transactions.flatMap((transaction) =>
    transaction.overflows
      .filter((overflow) => overflow.status !== "RFND")
      .map((overflow) => ({
        ...overflow,
        transactionOrderNumber: transaction.order_number,
        identifierNumber: transaction.identifier_number,
      })),
  );
  const [confirmAction, setConfirmAction] = useState<ConfirmRefundAction | null>(null);

  function closeModal() {
    setConfirmAction(null);
    onClose();
  }

  function openConfirmation(action: ConfirmRefundAction) {
    setConfirmAction(action);
  }

  function handleConfirmRefund() {
    if (!confirmAction) {
      return;
    }

    if (requireOverrideCode && !adminOverrideCode.trim()) {
      return;
    }

    if (confirmAction.kind === "ticket") {
      onRefundTicket();
      return;
    }

    if (confirmAction.kind === "transaction") {
      onRefundTransaction(confirmAction.id);
      return;
    }

    onRefundOverflow(confirmAction.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 px-4"
      onClick={closeModal}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6"
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

        {ticket.repeat_ticket_id ? (
          <label className="mt-5 flex items-start gap-3 rounded-[20px] border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={syncRepeatTicket}
              onChange={(event) => onSyncRepeatTicketChange(event.target.checked)}
              disabled={Boolean(busyAction)}
              className="mt-1 h-4 w-4 rounded border-stone-300"
            />
            <span>Also update the linked repeat ticket template.</span>
          </label>
        ) : null}

        {refundableTransactions.length ? (
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
                onClick={() =>
                  openConfirmation({
                    kind: "ticket",
                    label: `Refund the full ticket ${ticket.ticket_number}`,
                  })
                }
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

        {showTransactionRefunds ? (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Transaction refunds
            </p>
            {refundableTransactions.map((transaction) => (
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
                    onClick={() =>
                      openConfirmation({
                        kind: "transaction",
                        id: transaction.id,
                        label: `Refund transaction ${transaction.order_number}`,
                      })
                    }
                    disabled={Boolean(busyAction)}
                  >
                    {busyAction?.kind === "transaction" &&
                    busyAction.id === transaction.id
                      ? "Refunding..."
                      : "Refund transaction"}
                  </Button>
                </div>
              </div>
            ))}
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
                    onClick={() =>
                      openConfirmation({
                        kind: "overflow",
                        id: overflow.id,
                        label: `Refund spill over for ${overflow.identifierNumber}`,
                      })
                    }
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
          <Button variant="outline" onClick={closeModal} disabled={Boolean(busyAction)}>
            Close
          </Button>
        </div>

        {confirmAction ? (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-stone-950/30 px-4"
            onClick={() => setConfirmAction(null)}
          >
            <div
              className="w-full max-w-lg rounded-[24px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)]"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Confirmation
              </p>
              <h3 className="mt-2 text-xl font-semibold text-stone-950">
                Confirm refund
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                {confirmAction.label}. This action will reverse the selected ticket records.
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
              <div className="mt-5 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setConfirmAction(null)}
                  disabled={Boolean(busyAction)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmRefund}
                  disabled={Boolean(busyAction) || (requireOverrideCode && !adminOverrideCode.trim())}
                >
                  Confirm refund
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
