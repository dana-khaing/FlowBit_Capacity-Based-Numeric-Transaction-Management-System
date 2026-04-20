"use client";

import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleExclamation } from "@fortawesome/free-solid-svg-icons";

type AdminActionToastProps = {
  message: string;
  type: "success" | "error";
  onClose: () => void;
};

export function AdminActionToast({ message, type, onClose }: AdminActionToastProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timeoutId);
  }, [message, onClose]);

  const isError = type === "error";

  return (
    <div
      className={`fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-[20px] border bg-white px-4 py-4 shadow-[0_12px_32px_rgba(24,24,24,0.12)] ${
        isError ? "border-rose-200" : "border-emerald-200"
      }`}
    >
      <span className={`mt-0.5 ${isError ? "text-rose-600" : "text-emerald-600"}`}>
        <FontAwesomeIcon icon={isError ? faCircleExclamation : faCircleCheck} className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-stone-900">{isError ? "Action blocked" : "Success"}</p>
        <p className="mt-1 text-sm leading-6 text-stone-600">{message}</p>
      </div>
      <button type="button" onClick={onClose} className="text-sm font-medium text-stone-400 hover:text-stone-700">
        Close
      </button>
    </div>
  );
}
