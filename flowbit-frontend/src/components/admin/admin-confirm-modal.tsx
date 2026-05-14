"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  codeLabel?: string;
  codeValue?: string;
  confirmLabel: string;
  showCodeInput?: boolean;
  busy?: boolean;
  children?: ReactNode;
  onCodeChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AdminConfirmModal({
  open,
  title,
  description,
  codeLabel = "Current override code",
  codeValue = "",
  confirmLabel,
  showCodeInput = true,
  busy = false,
  children,
  onCodeChange,
  onCancel,
  onConfirm,
}: AdminConfirmModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/30 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Confirmation</p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-500">
          {description}
        </p>

        {showCodeInput ? (
          <label className="mt-5 block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{codeLabel}</span>
            <Input
              type="password"
              value={codeValue}
              onChange={(event) => onCodeChange(event.target.value)}
              placeholder="Enter override code"
              disabled={busy}
            />
          </label>
        ) : null}

        {children ? <div className="mt-5">{children}</div> : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
