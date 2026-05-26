"use client";

import { useState, type ChangeEventHandler, type HTMLAttributes, type KeyboardEventHandler } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AuthInputProps = {
  label: string;
  type: "text" | "password" | "email" | "tel";
  placeholder: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  name?: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  disabled?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  hideErrorMessage?: boolean;
  id?: string;
};

export function AuthInput({
  label,
  type,
  placeholder,
  error,
  hint,
  hideErrorMessage = false,
  className,
  id,
  ...props
}: AuthInputProps & { className?: string }) {
  const inputId =
    id ||
    (props.name
      ? `auth-input-${props.name}`
      : `auth-input-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`);
  const descriptionId = `${inputId}-description`;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && showPassword ? "text" : type;

  return (
    <label className={cn("block", className)}>
      <span className="text-sm font-medium text-stone-600">{label}</span>
      <div className="relative mt-2">
        <Input
          id={inputId}
          type={resolvedType}
          placeholder={placeholder}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error || hint ? descriptionId : undefined}
          className={cn(error ? "border-red-300 bg-red-50/60 pr-12 focus:border-red-500" : isPassword ? "pr-12" : "")}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((current) => !current)}
            className="absolute inset-y-0 right-3 inline-flex items-center text-stone-400 transition hover:text-stone-700"
          >
            <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {error && !hideErrorMessage ? (
        <p id={descriptionId} className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={descriptionId} className="mt-2 text-sm text-stone-500">
          {hint}
        </p>
      ) : null}
    </label>
  );
}
