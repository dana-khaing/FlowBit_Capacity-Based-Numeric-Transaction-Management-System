"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { AuthInput } from "./auth-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { checkUsernameAvailability, registerAccount } from "@/lib/auth-client";

const signUpNotes = [
  "Fill in your account details carefully before submitting.",
  "After your account is created, verify your email before you can log in.",
  "Contact your administrator if you need help with account access or approval.",
];

export function SignUpFormCard() {
  const router = useRouter();
  const [formValues, setFormValues] = useState({
    full_name: "",
    username: "",
    email: "",
    phone_number: "",
    password: "",
    confirm_password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof formValues, string>>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [usernameHint, setUsernameHint] = useState("");
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const username = formValues.username.trim();
    setIsUsernameAvailable(null);

    if (!username) {
      setUsernameHint("");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      checkUsernameAvailability(username)
        .then((result) => {
          if (formValues.username.trim() !== username) {
            return;
          }
          setIsUsernameAvailable(result.available);
          setUsernameHint(result.message);
          setFieldErrors((current) => ({
            ...current,
            username: result.available ? undefined : result.message,
          }));
        })
        .catch(() => {
          if (formValues.username.trim() === username) {
            setUsernameHint("Username availability could not be checked right now.");
          }
        });
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [formValues.username]);

  function validateForm() {
    const nextErrors: Partial<Record<keyof typeof formValues, string>> = {};

    if (!formValues.full_name.trim()) {
      nextErrors.full_name = "Enter your full name.";
    }
    if (!formValues.username.trim()) {
      nextErrors.username = "Choose a username.";
    } else if (isUsernameAvailable === false) {
      nextErrors.username = usernameHint || "This username is already taken.";
    }
    if (!formValues.email.trim()) {
      nextErrors.email = "Enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.email)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!formValues.password) {
      nextErrors.password = "Create a password.";
    } else if (formValues.password.length < 8) {
      nextErrors.password = "Use at least 8 characters.";
    }
    if (!formValues.confirm_password) {
      nextErrors.confirm_password = "Confirm your password.";
    } else if (formValues.confirm_password !== formValues.password) {
      nextErrors.confirm_password = "Passwords do not match.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleCreateAccount() {
    setErrorMessage("");
    if (!validateForm()) {
      return;
    }
    setIsSubmitting(true);

    try {
      await registerAccount(formValues);
      router.push(`/login?signup=verify-email&email=${encodeURIComponent(formValues.email.trim())}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create your account.";
      if (message.startsWith("Account created,")) {
        router.push(
          `/login?signup=verify-email&delivery=failed&email=${encodeURIComponent(formValues.email.trim())}&message=${encodeURIComponent(message)}`,
        );
        return;
      }
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mt-5 bg-white/82 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-8 lg:mt-0 lg:w-[54%]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-stone-500">Sign Up</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-950">Create your account</h2>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-600"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
          Back to login
        </Link>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <AuthInput
          label="Full name"
          type="text"
          placeholder="Enter your full name"
          error={fieldErrors.full_name}
          value={formValues.full_name}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, full_name: event.target.value }));
            setFieldErrors((current) => ({ ...current, full_name: undefined }));
          }}
        />
        <AuthInput
          label="Username"
          type="text"
          placeholder="Choose a username"
          error={fieldErrors.username}
          hint={isUsernameAvailable ? usernameHint : undefined}
          value={formValues.username}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, username: event.target.value }));
            setFieldErrors((current) => ({ ...current, username: undefined }));
            setUsernameHint("");
          }}
        />
        <AuthInput
          label="Email address"
          type="email"
          placeholder="Enter your email address"
          autoComplete="email"
          error={fieldErrors.email}
          value={formValues.email}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, email: event.target.value }));
            setFieldErrors((current) => ({ ...current, email: undefined }));
          }}
        />
        <AuthInput
          label="Phone number (optional)"
          type="tel"
          placeholder="Enter your phone number"
          autoComplete="tel"
          inputMode="tel"
          error={fieldErrors.phone_number}
          value={formValues.phone_number}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, phone_number: event.target.value }));
            setFieldErrors((current) => ({ ...current, phone_number: undefined }));
          }}
        />
        <AuthInput
          label="Password"
          type="password"
          placeholder="Create a password"
          autoComplete="new-password"
          hint="Use at least 8 characters."
          error={fieldErrors.password}
          value={formValues.password}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, password: event.target.value }));
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
        />
        <AuthInput
          label="Confirm password"
          type="password"
          placeholder="Confirm your password"
          autoComplete="new-password"
          error={fieldErrors.confirm_password}
          value={formValues.confirm_password}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, confirm_password: event.target.value }));
            setFieldErrors((current) => ({ ...current, confirm_password: undefined }));
          }}
        />
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" size="lg" onClick={handleCreateAccount} disabled={isSubmitting}>
          <FontAwesomeIcon icon={faUserPlus} className="h-4 w-4" />
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
        <Link
          href="/login"
          className="inline-flex flex-1 items-center justify-center rounded-[20px] border border-stone-900/10 bg-white px-5 py-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          I already have an account
        </Link>
      </div>

      <p className="mt-5 text-sm leading-7 text-stone-600">
        After your account is created, FlowBit will send a verification link to your email address before login is allowed.
      </p>

      <Card className="mt-8 rounded-[24px] bg-[#f5f1ea]">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Account Setup</p>
              <h3 className="mt-2 text-lg font-semibold text-stone-950">Before you continue</h3>
            </div>
            <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600">New user</div>
          </div>

          <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
            {signUpNotes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Card>
  );
}
