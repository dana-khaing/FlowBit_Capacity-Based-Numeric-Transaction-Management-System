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
import { loginWithGoogle, loginWithPassword } from "@/lib/auth-client";
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
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setKeepSignedIn(window.localStorage.getItem(KEEP_SIGNED_IN_KEY) === "true");
    setShowSignUpSuccess(new URLSearchParams(window.location.search).get("signup") === "success");
  }, []);

  function handleKeepSignedInChange(nextChecked: boolean) {
    setKeepSignedIn(nextChecked);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEEP_SIGNED_IN_KEY, String(nextChecked));
    }
  }

  async function handleLogin() {
    setErrorMessage("");
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
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
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

      {errorMessage ? (
        <div className="mt-6 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <AuthInput
          label="Username"
          type="text"
          placeholder="Enter your username"
          name="username"
          autoComplete="username"
          value={credentials.username}
          onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
        />
        <AuthInput
          label="Password"
          type="password"
          placeholder="Enter your password"
          name="password"
          autoComplete="current-password"
          value={credentials.password}
          onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
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

      <div className="mt-5 flex items-center gap-4">
        <div className="h-px flex-1 bg-stone-200" />
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">or continue with</span>
        <div className="h-px flex-1 bg-stone-200" />
      </div>

      <div className="mt-5">
        <GoogleSignInButton
          disabled={isSubmitting}
          onCredential={handleGoogleCredential}
          onError={handleGoogleError}
        />
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
          <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600">Support</div>
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
