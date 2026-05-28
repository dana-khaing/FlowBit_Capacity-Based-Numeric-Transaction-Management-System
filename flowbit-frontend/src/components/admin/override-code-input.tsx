"use client";

import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

type OverrideCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
};

const CODE_LENGTH = 4;

function sanitizeOverrideCode(value: string) {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function OverrideCodeInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  className,
  inputClassName,
}: OverrideCodeInputProps) {
  const normalizedValue = useMemo(() => sanitizeOverrideCode(value), [value]);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function focusIndex(index: number) {
    const target = refs.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  }

  function updateAt(index: number, rawValue: string) {
    const sanitized = sanitizeOverrideCode(rawValue);
    if (!sanitized) {
      const next = normalizedValue.split("");
      next[index] = "";
      onChange(next.join("").slice(0, CODE_LENGTH));
      return;
    }

    if (sanitized.length > 1) {
      onChange(sanitized);
      focusIndex(Math.min(sanitized.length, CODE_LENGTH) - 1);
      return;
    }

    const next = normalizedValue.padEnd(CODE_LENGTH, " ").split("");
    next[index] = sanitized;
    onChange(next.join("").replace(/\s/g, ""));
    if (index < CODE_LENGTH - 1) {
      focusIndex(index + 1);
    }
  }

  return (
    <div className={cn("flex gap-2 sm:gap-3", className)}>
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{1}"
          maxLength={1}
          value={normalizedValue[index] ?? ""}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          onChange={(event) => updateAt(index, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !normalizedValue[index] && index > 0) {
              event.preventDefault();
              const next = normalizedValue.split("");
              next[index - 1] = "";
              onChange(next.join(""));
              focusIndex(index - 1);
            }
            if (event.key === "ArrowLeft" && index > 0) {
              event.preventDefault();
              focusIndex(index - 1);
            }
            if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
              event.preventDefault();
              focusIndex(index + 1);
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            const pasted = sanitizeOverrideCode(event.clipboardData.getData("text"));
            if (!pasted) {
              return;
            }
            onChange(pasted);
            focusIndex(Math.min(pasted.length, CODE_LENGTH) - 1);
          }}
          className={cn(
            "h-12 w-12 rounded-[18px] border border-stone-900/10 bg-stone-50 text-center text-lg font-semibold text-stone-950 outline-none transition focus:border-stone-950 disabled:cursor-not-allowed disabled:opacity-60 sm:h-14 sm:w-14 sm:text-xl",
            inputClassName,
          )}
        />
      ))}
    </div>
  );
}
