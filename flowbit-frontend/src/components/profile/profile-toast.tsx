"use client";

import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";

type ProfileToastProps = {
  message: string;
  onClose: () => void;
};

export function ProfileToast({ message, onClose }: ProfileToastProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timeoutId);
  }, [message, onClose]);

  return (
    <div className="fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-[20px] border border-emerald-200 bg-white px-4 py-4 shadow-[0_12px_32px_rgba(24,24,24,0.12)]">
      <span className="mt-0.5 text-emerald-600">
        <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-stone-900">Success</p>
        <p className="mt-1 text-sm leading-6 text-stone-600">{message}</p>
      </div>
      <button type="button" onClick={onClose} className="text-sm font-medium text-stone-400 hover:text-stone-700">
        Close
      </button>
    </div>
  );
}
