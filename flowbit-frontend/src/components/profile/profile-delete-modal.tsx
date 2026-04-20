"use client";

import { ReactNode } from "react";

type ProfileDeleteModalProps = {
  title: string;
  description: string;
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  isSubmitting?: boolean;
};

export function ProfileDeleteModal({
  title,
  description,
  children,
  isOpen,
  onClose,
  onConfirm,
  confirmLabel,
  isSubmitting = false,
}: ProfileDeleteModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4">
      <div className="w-full max-w-lg rounded-[28px] border border-stone-900/10 bg-white p-6 shadow-[0_18px_48px_rgba(24,24,24,0.22)]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-red-500">Confirm deletion</p>
        <h3 className="mt-2 text-2xl font-semibold text-stone-950">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>

        <div className="mt-5">{children}</div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-[20px] border border-stone-900/10 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-[20px] bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {isSubmitting ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
