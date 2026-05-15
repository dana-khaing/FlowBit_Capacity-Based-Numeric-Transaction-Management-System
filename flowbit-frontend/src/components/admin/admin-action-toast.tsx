"use client";

import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleExclamation, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

type AdminActionToastProps = {
  message: string;
  type: "success" | "error" | "warning";
  title?: string;
  onClose: () => void;
};

export function AdminActionToast({ message, type, title, onClose }: AdminActionToastProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timeoutId);
  }, [message, onClose]);

  const isError = type === "error";
  const isWarning = type === "warning";
  const icon = isError ? faCircleExclamation : isWarning ? faTriangleExclamation : faCircleCheck;
  const borderClass = isError ? "border-rose-200" : isWarning ? "border-amber-200" : "border-emerald-200";
  const iconClass = isError ? "text-rose-600" : isWarning ? "text-amber-700" : "text-emerald-600";
  const heading = title ?? (isError ? "Action blocked" : isWarning ? "Attention" : "Success");

  return (
    <div
      className={`fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-[20px] border bg-white px-4 py-4 shadow-[0_12px_32px_rgba(24,24,24,0.12)] ${borderClass}`}
    >
      <span className={`mt-0.5 ${iconClass}`}>
        <FontAwesomeIcon icon={icon} className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-stone-900">{heading}</p>
        <p className="mt-1 text-sm leading-6 text-stone-600">{message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss toast"
        className="text-sm font-semibold leading-none text-stone-400 transition hover:text-stone-700"
      >
        X
      </button>
    </div>
  );
}
