"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faKey } from "@fortawesome/free-solid-svg-icons";
import { OverrideCodeInput } from "@/components/admin/override-code-input";
import { AuthInput } from "./auth-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resetOverrideCode } from "@/lib/auth-client";

type ResetOverrideCodeFormCardProps = {
  selector: string;
  token: string;
};

export function ResetOverrideCodeFormCard({ selector, token }: ResetOverrideCodeFormCardProps) {
  const router = useRouter();
  const [newOverrideCode, setNewOverrideCode] = useState("");
  const [confirmOverrideCode, setConfirmOverrideCode] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    newOverrideCode?: string;
    confirmOverrideCode?: string;
    accountPassword?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validateForm() {
    const nextErrors: { newOverrideCode?: string; confirmOverrideCode?: string; accountPassword?: string } = {};

    if (newOverrideCode.length !== 4) {
      nextErrors.newOverrideCode = "Enter a 4-digit override code.";
    }
    if (confirmOverrideCode.length !== 4) {
      nextErrors.confirmOverrideCode = "Confirm the same 4-digit override code.";
    } else if (confirmOverrideCode !== newOverrideCode) {
      nextErrors.confirmOverrideCode = "Override codes do not match.";
    }
    if (!accountPassword) {
      nextErrors.accountPassword = "Enter your account password.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleResetOverrideCode() {
    setMessage("");
    setErrorMessage("");
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await resetOverrideCode({
        selector,
        token,
        new_override_code: newOverrideCode,
        confirm_override_code: confirmOverrideCode,
        account_password: accountPassword,
      });
      setMessage("Override code reset successfully. Redirecting to login...");
      setNewOverrideCode("");
      setConfirmOverrideCode("");
      setAccountPassword("");
      router.push("/login");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to reset override code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mt-5 bg-white/82 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-8 lg:mt-0 lg:w-[54%]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-stone-500">Reset Override Code</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-950">Set a new 4-digit code</h2>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-600"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
          Back to login
        </Link>
      </div>

      <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-600">
        Enter a new 4-digit override code, confirm it, and then verify your normal account password to finish the reset.
      </p>

      <div className="mt-8 space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-600">New override code</p>
          <OverrideCodeInput
            value={newOverrideCode}
            onChange={(value) => {
              setNewOverrideCode(value);
              setFieldErrors((current) => ({ ...current, newOverrideCode: undefined }));
            }}
            autoFocus
          />
          {fieldErrors.newOverrideCode ? <p className="text-sm text-red-700">{fieldErrors.newOverrideCode}</p> : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-600">Confirm override code</p>
          <OverrideCodeInput
            value={confirmOverrideCode}
            onChange={(value) => {
              setConfirmOverrideCode(value);
              setFieldErrors((current) => ({ ...current, confirmOverrideCode: undefined }));
            }}
          />
          {fieldErrors.confirmOverrideCode ? <p className="text-sm text-red-700">{fieldErrors.confirmOverrideCode}</p> : null}
        </div>

        <AuthInput
          label="Account password"
          type="password"
          placeholder="Enter your account password"
          autoComplete="current-password"
          error={fieldErrors.accountPassword}
          value={accountPassword}
          onChange={(event) => {
            setAccountPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, accountPassword: undefined }));
          }}
        />
      </div>

      {message ? (
        <div className="mt-6 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-6 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" size="lg" onClick={handleResetOverrideCode} disabled={isSubmitting}>
          <FontAwesomeIcon icon={faKey} className="h-4 w-4" />
          {isSubmitting ? "Resetting..." : "Reset override code"}
        </Button>
        <Link
          href="/login"
          className="inline-flex flex-1 items-center justify-center rounded-[20px] border border-stone-900/10 bg-white px-5 py-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          Open login
        </Link>
      </div>

      <Card className="mt-8 rounded-[24px] bg-[#f5f1ea]">
        <CardContent className="p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Security Note</p>
          <h3 className="mt-2 text-lg font-semibold text-stone-950">Keep your override code private</h3>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            This code approves protected admin actions. Do not reuse old patterns, and only share it with yourself.
          </p>
        </CardContent>
      </Card>
    </Card>
  );
}
