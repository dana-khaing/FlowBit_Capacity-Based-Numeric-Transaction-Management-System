"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faEnvelopeCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifyEmailAddress } from "@/lib/auth-client";

type VerifyEmailFormCardProps = {
  selector: string;
  token: string;
};

export function VerifyEmailFormCard({ selector, token }: VerifyEmailFormCardProps) {
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function runVerification() {
      if (!selector || !token) {
        if (isMounted) {
          setErrorMessage("Verification link is incomplete or invalid.");
          setIsSubmitting(false);
        }
        return;
      }

      try {
        const response = await verifyEmailAddress({ selector, token });
        if (isMounted) {
          setMessage(response.message);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to verify email.");
        }
      } finally {
        if (isMounted) {
          setIsSubmitting(false);
        }
      }
    }

    void runVerification();
    return () => {
      isMounted = false;
    };
  }, [selector, token]);

  return (
    <Card className="mt-5 bg-white/82 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-8 lg:mt-0 lg:w-[54%]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-stone-500">Verify Email</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-950">Activate your account</h2>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-600"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
          Back to login
        </Link>
      </div>

      <div className="mt-8 rounded-[24px] border border-stone-200 bg-stone-50 p-6">
        <div className="flex items-center gap-3 text-stone-900">
          <FontAwesomeIcon icon={faEnvelopeCircleCheck} className="h-6 w-6 text-[#b66427]" />
          <p className="text-lg font-semibold">
            {isSubmitting ? "Verifying your email..." : message ? "Email verified" : "Verification failed"}
          </p>
        </div>
        <p className="mt-4 text-sm leading-7 text-stone-600">
          {isSubmitting
            ? "FlowBit is checking your verification link now."
            : message || errorMessage}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="inline-flex flex-1 items-center justify-center rounded-[20px] border border-stone-900/10 bg-white px-5 py-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          Return to login
        </Link>
        {!message && !isSubmitting ? (
          <Link
            href="/login"
            className="inline-flex flex-1 items-center justify-center rounded-[20px] bg-stone-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Open login to resend verification
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
