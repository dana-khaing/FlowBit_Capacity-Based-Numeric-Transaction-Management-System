"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRightToBracket } from "@fortawesome/free-solid-svg-icons";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import Link from "next/link";
import { AuthInput } from "./auth-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

const accessNotes = [
  "Use your assigned account details to access your workspace.",
  "If you cannot sign in, use the password recovery option or contact your administrator.",
  "Google sign-in may be available for your organization depending on your access setup.",
];

const KEEP_SIGNED_IN_KEY = "flowbit.keepSignedIn";

export function LoginFormCard() {
  const [keepSignedIn, setKeepSignedIn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setKeepSignedIn(window.localStorage.getItem(KEEP_SIGNED_IN_KEY) === "true");
  }, []);

  function handleKeepSignedInChange(nextChecked: boolean) {
    setKeepSignedIn(nextChecked);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEEP_SIGNED_IN_KEY, String(nextChecked));
    }
  }

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

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <AuthInput label="Username" type="text" placeholder="Enter your username" />
        <AuthInput label="Password" type="password" placeholder="Enter your password" />
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
        <Button className="flex-1" size="lg">
          <FontAwesomeIcon icon={faArrowRightToBracket} className="h-4 w-4" />
          Log in to FlowBit
        </Button>
        <Button variant="outline" className="flex-1" size="lg">
          <FontAwesomeIcon icon={faGoogle} className="h-4 w-4" />
          Continue with Google
        </Button>
      </div>

      <p className="mt-5 text-sm text-stone-500">
        New to FlowBit?{" "}
        <Link href="/sign-up" className="font-medium text-[#b66427]">
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
