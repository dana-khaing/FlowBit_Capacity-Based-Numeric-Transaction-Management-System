"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { AuthInput } from "./auth-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requestPasswordReset } from "@/lib/auth-client";

const recoveryNotes = [
  "Enter the email address linked to your account.",
  "If the address is recognized, you will receive instructions to reset your password.",
  "After resetting your password, sign in again to continue to your workspace.",
];

export function ForgotPasswordFormCard() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validateEmail() {
    if (!email.trim()) {
      setEmailError("Enter your email address.");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email address.");
      return false;
    }

    setEmailError("");
    return true;
  }

  async function handlePasswordReset() {
    setErrorMessage("");
    setMessage("");
    if (!validateEmail()) {
      return;
    }
    setIsSubmitting(true);

    try {
      const response = await requestPasswordReset(email);
      setMessage(response.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to request password reset.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mt-5 bg-white/82 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-8 lg:mt-0 lg:w-[54%]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-stone-500">Forgot Password</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-950">Recover your account</h2>
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
        We will send a password recovery link to your email address. For security reasons, the same message may be shown
        whether or not an account exists.
      </p>

      <div className="mt-8">
        <AuthInput
          label="Email address"
          type="email"
          placeholder="Enter your email address"
          name="email"
          autoComplete="email"
          error={emailError}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handlePasswordReset();
            }
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
        <Button className="flex-1" size="lg" onClick={handlePasswordReset} disabled={isSubmitting}>
          <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4" />
          {isSubmitting ? "Sending..." : message ? "Email sent" : "Send recovery email"}
        </Button>
        <Link
          href="/login"
          className="inline-flex flex-1 items-center justify-center rounded-[20px] border border-stone-900/10 bg-white px-5 py-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          Return to login
        </Link>
      </div>

      <Card className="mt-8 rounded-[24px] bg-[#f5f1ea]">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Recovery Help</p>
              <h3 className="mt-2 text-lg font-semibold text-stone-950">What happens next</h3>
            </div>
            <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600">Email</div>
          </div>

          <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
            {recoveryNotes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Card>
  );
}
