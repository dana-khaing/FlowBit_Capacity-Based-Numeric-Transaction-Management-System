"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faKey } from "@fortawesome/free-solid-svg-icons";
import { AuthInput } from "./auth-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KEEP_SIGNED_IN_KEY } from "@/lib/auth";
import { resetPassword } from "@/lib/auth-client";

type ResetPasswordFormCardProps = {
  selector: string;
  token: string;
};

export function ResetPasswordFormCard({ selector, token }: ResetPasswordFormCardProps) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setKeepSignedIn(window.localStorage.getItem(KEEP_SIGNED_IN_KEY) === "true");
    }
  }, []);

  function validateForm() {
    const nextErrors: { newPassword?: string; confirmPassword?: string } = {};

    if (!newPassword) {
      nextErrors.newPassword = "Enter your new password.";
    } else if (newPassword.length < 8) {
      nextErrors.newPassword = "Use at least 8 characters.";
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Confirm your new password.";
    } else if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleResetPassword() {
    setErrorMessage("");
    setMessage("");
    if (!validateForm()) {
      return;
    }
    setIsSubmitting(true);

    try {
      await resetPassword({ selector, token, new_password: newPassword }, keepSignedIn);
      setMessage("Password reset successfully. Redirecting to your workspace...");
      router.push("/");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mt-5 bg-white/82 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-8 lg:mt-0 lg:w-[54%]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-stone-500">Reset Password</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-950">Create a new password</h2>
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
        Enter your new password below. If the reset link has expired or is invalid, request a new password reset email.
      </p>

      <div className="mt-8">
        <AuthInput
          label="New password"
          type="password"
          placeholder="Enter your new password"
          autoComplete="new-password"
          hint="Use a password you do not use elsewhere."
          error={fieldErrors.newPassword}
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, newPassword: undefined }));
          }}
        />
      </div>

      <div className="mt-4">
        <AuthInput
          label="Confirm new password"
          type="password"
          placeholder="Confirm your new password"
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
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
        <Button className="flex-1" size="lg" onClick={handleResetPassword} disabled={isSubmitting}>
          <FontAwesomeIcon icon={faKey} className="h-4 w-4" />
          {isSubmitting ? "Resetting..." : "Reset password"}
        </Button>
        <Link
          href="/forgot-password"
          className="inline-flex flex-1 items-center justify-center rounded-[20px] border border-stone-900/10 bg-white px-5 py-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          Request another email
        </Link>
      </div>

      <Card className="mt-8 rounded-[24px] bg-[#f5f1ea]">
        <CardContent className="p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Security Note</p>
          <h3 className="mt-2 text-lg font-semibold text-stone-950">Use a strong new password</h3>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            Choose a password you do not use anywhere else. After reset, you will be signed in and returned to the app.
          </p>
        </CardContent>
      </Card>
    </Card>
  );
}
