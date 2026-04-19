"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { AuthInput } from "./auth-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const signUpNotes = [
  "Fill in your account details carefully before submitting.",
  "After your account is created, sign in with your new credentials to continue.",
  "Contact your administrator if you need help with account access or approval.",
];

export function SignUpFormCard() {
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
        <AuthInput label="Full name" type="text" placeholder="Enter your full name" />
        <AuthInput label="Username" type="text" placeholder="Choose a username" />
        <AuthInput label="Email address" type="text" placeholder="Enter your email address" />
        <AuthInput label="Phone number" type="text" placeholder="Enter your phone number" />
        <AuthInput label="Password" type="password" placeholder="Create a password" />
        <AuthInput label="Confirm password" type="password" placeholder="Confirm your password" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" size="lg">
          <FontAwesomeIcon icon={faUserPlus} className="h-4 w-4" />
          Create account
        </Button>
        <Link
          href="/login"
          className="inline-flex flex-1 items-center justify-center rounded-[20px] border border-stone-900/10 bg-white px-5 py-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          Log in after sign up
        </Link>
      </div>

      <p className="mt-5 text-sm leading-7 text-stone-600">
        After your account is created, you will return to the login flow and sign in with your new account details.
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
