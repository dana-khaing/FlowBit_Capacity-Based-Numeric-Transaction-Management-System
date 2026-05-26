"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRightToBracket } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { AuthInput } from "./auth-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { KEEP_SIGNED_IN_KEY } from "@/lib/auth";
import { loginWithGoogle, loginWithPassword, resendVerificationEmail } from "@/lib/auth-client";
import { GoogleSignInButton } from "./google-sign-in-button";

const accessNotes = [
  "Use your assigned account details to access your workspace.",
  "If you cannot sign in, use the password recovery option or contact your administrator.",
  "Google sign-in may be available for your organization depending on your access setup.",
];

export function LoginFormCard() {
  const router = useRouter();
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [showSignUpSuccess, setShowSignUpSuccess] = useState(false);
  const [showVerifyEmailNotice, setShowVerifyEmailNotice] = useState(false);
  const [showDeliveryFailureNotice, setShowDeliveryFailureNotice] = useState(false);
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [verificationEmail, setVerificationEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setKeepSignedIn(window.localStorage.getItem(KEEP_SIGNED_IN_KEY) === "true");
    const params = new URLSearchParams(window.location.search);
    const signupState = params.get("signup");
    const signupEmail = params.get("email") || "";
    const deliveryState = params.get("delivery");
    const deliveryMessage = params.get("message") || "";
    setShowSignUpSuccess(signupState === "success");
    setShowVerifyEmailNotice(signupState === "verify-email");
    setShowDeliveryFailureNotice(deliveryState === "failed");
    setVerificationEmail(signupEmail);
    if (deliveryState === "failed" && deliveryMessage) {
      setErrorMessage(deliveryMessage);
    }
  }, []);

  const showVerificationHelp = showVerifyEmailNotice || errorMessage === "Verify your email before logging in.";

  function handleKeepSignedInChange(nextChecked: boolean) {
    setKeepSignedIn(nextChecked);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEEP_SIGNED_IN_KEY, String(nextChecked));
    }
  }

  function validateForm() {
    const nextErrors: { username?: string; password?: string } = {};

    if (!credentials.username.trim()) {
      nextErrors.username = "Enter your username or email to continue.";
    }

    if (!credentials.password) {
      nextErrors.password = "Enter your password to continue.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleLogin() {
    setErrorMessage("");
    setResendError("");
    setResendMessage("");
    if (!validateForm()) {
      return;
    }
    setIsSubmitting(true);

    try {
      await loginWithPassword({
        username: credentials.username,
        password: credentials.password,
        remember: keepSignedIn,
      });
      router.push("/");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      setErrorMessage(message);
      if (message === "Verify your email before logging in." && !verificationEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.username.trim())) {
        setVerificationEmail(credentials.username.trim());
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification() {
    setResendError("");
    setResendMessage("");

    if (!verificationEmail.trim()) {
      setResendError("Enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verificationEmail.trim())) {
      setResendError("Enter a valid email address.");
      return;
    }

    setIsResending(true);
    try {
      const response = await resendVerificationEmail(verificationEmail.trim());
      setResendMessage(response.message);
    } catch (error) {
      setResendError(error instanceof Error ? error.message : "Unable to resend verification email.");
    } finally {
      setIsResending(false);
    }
  }

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setErrorMessage("");
      setIsSubmitting(true);

      try {
        await loginWithGoogle({
          idToken: credential,
          remember: keepSignedIn,
        });
        router.push("/");
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to sign in with Google.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [keepSignedIn, router],
  );

  const handleGoogleError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  return (
    <Card className="mt-5 bg-white/82 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-8 lg:mt-0 lg:w-[54%]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-stone-500">Log In</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-950">Welcome back</h2>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-600"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
          Back to dashboard
        </Link>
      </div>

      {showSignUpSuccess ? (
        <div className="mt-6 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Account created. Log in with your new details to continue.
        </div>
      ) : null}

      {showVerifyEmailNotice ? (
        <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Account created. Check your email for the verification link before logging in.
        </div>
      ) : null}

      {showDeliveryFailureNotice ? (
        <div className="mt-6 rounded-[20px] border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          The account was created, but FlowBit could not send the verification email yet. Use resend below after checking your sender setup.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-6 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}

      {showVerificationHelp ? (
        <div className="mt-6 rounded-[24px] border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-700">
          <p className="font-medium text-stone-900">Need another verification email?</p>
          <p className="mt-1 text-stone-600">Enter the email address for this account and FlowBit will send a fresh verification link. Also check your spam or junk folder.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <AuthInput
                label="Verification email"
                type="email"
                placeholder="Enter your email address"
                autoComplete="email"
                error={resendError}
                hideErrorMessage
                value={verificationEmail}
                onChange={(event) => {
                  setVerificationEmail(event.target.value);
                  setResendError("");
                }}
              />
            </div>
            <Button size="lg" onClick={handleResendVerification} disabled={isResending}>
              {isResending ? "Sending..." : "Resend verification"}
            </Button>
          </div>
          {resendError ? <p className="mt-3 text-sm text-red-700">{resendError}</p> : null}
          {resendMessage ? (
            <p className="mt-3 text-sm text-emerald-700">
              {resendMessage} If it does not arrive, check spam or try again shortly.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <AuthInput
          label="Username or email"
          type="text"
          placeholder="Enter your username or email"
          name="username"
          autoComplete="username"
          error={fieldErrors.username}
          value={credentials.username}
          onChange={(event) => {
            setCredentials((current) => ({ ...current, username: event.target.value }));
            setFieldErrors((current) => ({ ...current, username: undefined }));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleLogin();
            }
          }}
        />
        <AuthInput
          label="Password"
          type="password"
          placeholder="Enter your password"
          name="password"
          autoComplete="current-password"
          error={fieldErrors.password}
          value={credentials.password}
          onChange={(event) => {
            setCredentials((current) => ({ ...current, password: event.target.value }));
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleLogin();
            }
          }}
        />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-3 text-sm text-stone-500">
          <Checkbox checked={keepSignedIn} onCheckedChange={(checked) => handleKeepSignedInChange(checked === true)} />
          Keep me signed in on this device
        </label>

        <Link href="/forgot-password" className="text-sm font-medium text-[#b66427]">
          Forgot password?
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" size="lg" onClick={handleLogin} disabled={isSubmitting}>
          <FontAwesomeIcon icon={faArrowRightToBracket} className="h-4 w-4" />
          {isSubmitting ? "Signing in..." : "Log in to FlowBit"}
        </Button>
      </div>

      <div className="mx-auto mt-5 w-full max-w-[460px]">
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-stone-200" />
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Google</span>
          <div className="h-px flex-1 bg-stone-200" />
        </div>

        <div className="mt-4">
          <GoogleSignInButton
            disabled={isSubmitting}
            onCredential={handleGoogleCredential}
            onError={handleGoogleError}
          />
        </div>
      </div>

      <p className="mt-5 text-sm text-stone-500">
        New to FlowBit?{" "}
        <Link href="/sign-up" className="font-medium text-[#b66427] underline underline-offset-4">
          Create an account
        </Link>
      </p>

      <Card className="mt-8 rounded-[24px] bg-[#f5f1ea]">
        <CardContent className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Sign-In Help</p>
            <h3 className="mt-2 text-lg font-semibold text-stone-950">Need help accessing your account?</h3>
          </div>
          <Link
            href="/login-help"
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 underline underline-offset-4 transition hover:bg-stone-100 hover:text-stone-900"
          >
            Can&apos;t log in? Contact admin
          </Link>
        </div>

        <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
          {accessNotes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        </CardContent>
      </Card>
    </Card>
  );
}
