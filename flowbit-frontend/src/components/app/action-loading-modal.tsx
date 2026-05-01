"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleNotch } from "@fortawesome/free-solid-svg-icons";

type ActionLoadingModalProps = {
  open: boolean;
  title: string;
  description: string;
};

export function ActionLoadingModal({ open, title, description }: ActionLoadingModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 px-4">
      <div className="w-full max-w-md rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-stone-100 text-stone-700">
            <FontAwesomeIcon icon={faCircleNotch} className="h-6 w-6 animate-spin" />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Processing</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">{description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
