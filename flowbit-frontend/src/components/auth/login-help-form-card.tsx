"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faLifeRing } from "@fortawesome/free-solid-svg-icons";
import { AuthInput } from "./auth-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPublicLoginHelpCase } from "@/lib/support-client";

const helpNotes = [
  "Use the username or email you normally use to sign in.",
  "Explain what happened and what you already tried, such as reset password or resend verification.",
  "The admin will review the case in FlowBit and contact you outside the app if needed.",
];

export function LoginHelpFormCard() {
  const [formValues, setFormValues] = useState({
    login_identifier: "",
    requester_name: "",
    requester_email: "",
    subject: "",
    message: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof formValues, string>>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validateForm() {
    const nextErrors: Partial<Record<keyof typeof formValues, string>> = {};

    if (!formValues.login_identifier.trim()) {
      nextErrors.login_identifier = "Enter your username or email.";
    }
    if (!formValues.subject.trim()) {
      nextErrors.subject = "Enter a short issue summary.";
    }
    if (!formValues.requester_email.trim()) {
      nextErrors.requester_email = "Enter the email address you want the admin to reply to.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.requester_email.trim())) {
      nextErrors.requester_email = "Enter a valid email address.";
    }
    if (!formValues.message.trim()) {
      nextErrors.message = "Describe the login problem.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit() {
    setErrorMessage("");
    setSuccessMessage("");
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createPublicLoginHelpCase({
        login_identifier: formValues.login_identifier.trim(),
        requester_name: formValues.requester_name.trim(),
        requester_email: formValues.requester_email.trim(),
        subject: formValues.subject.trim(),
        message: formValues.message.trim(),
      });
      setSuccessMessage(response.message);
      setFormValues({
        login_identifier: "",
        requester_name: "",
        requester_email: "",
        subject: "",
        message: "",
      });
      setFieldErrors({});
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to send your login-help case.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mt-5 bg-white/82 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-8 lg:mt-0 lg:w-[54%]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-stone-500">Login Help</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-950">Contact admin about sign-in problems</h2>
        </div>
        <Link
          href="/login"
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-600"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
          Back to login
        </Link>
      </div>

      <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-600">
        Use this if reset password and verification steps did not solve the issue.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <AuthInput
          label="Username or email"
          type="text"
          placeholder="Enter the account username or email"
          name="login_identifier"
          autoComplete="username"
          error={fieldErrors.login_identifier}
          value={formValues.login_identifier}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, login_identifier: event.target.value }));
            setFieldErrors((current) => ({ ...current, login_identifier: undefined }));
          }}
        />
        <AuthInput
          label="Your name (optional)"
          type="text"
          placeholder="Enter your name"
          name="requester_name"
          autoComplete="name"
          error={fieldErrors.requester_name}
          value={formValues.requester_name}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, requester_name: event.target.value }));
            setFieldErrors((current) => ({ ...current, requester_name: undefined }));
          }}
        />
        <AuthInput
          label="Reply email"
          type="email"
          placeholder="Enter the email address for admin replies"
          name="requester_email"
          autoComplete="email"
          error={fieldErrors.requester_email}
          value={formValues.requester_email}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, requester_email: event.target.value }));
            setFieldErrors((current) => ({ ...current, requester_email: undefined }));
          }}
        />
      </div>

      <div className="mt-4 space-y-4">
        <AuthInput
          label="Subject"
          type="text"
          placeholder="Short issue summary"
          name="subject"
          error={fieldErrors.subject}
          value={formValues.subject}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, subject: event.target.value }));
            setFieldErrors((current) => ({ ...current, subject: undefined }));
          }}
        />
        <label className="block">
          <span className="text-sm font-medium text-stone-600">Message</span>
          <textarea
            value={formValues.message}
            onChange={(event) => {
              setFormValues((current) => ({ ...current, message: event.target.value }));
              setFieldErrors((current) => ({ ...current, message: undefined }));
            }}
            placeholder="Describe the sign-in problem and what you already tried."
            rows={6}
            className={`mt-2 w-full rounded-[18px] border px-4 py-3 text-base outline-none transition ${
              fieldErrors.message
                ? "border-red-300 bg-red-50/60 text-stone-950 focus:border-red-500"
                : "border-stone-900/10 bg-stone-50 text-stone-950 focus:border-stone-950"
            }`}
          />
          {fieldErrors.message ? (
            <p className="mt-2 text-sm text-red-700">{fieldErrors.message}</p>
          ) : null}
        </label>
      </div>

      {successMessage ? (
        <div className="mt-6 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-6 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" size="lg" onClick={handleSubmit} disabled={isSubmitting}>
          <FontAwesomeIcon icon={faLifeRing} className="h-4 w-4" />
          {isSubmitting ? "Sending..." : "Send login-help case"}
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
              <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Before you send it</p>
              <h3 className="mt-2 text-lg font-semibold text-stone-950">Useful details for admin</h3>
            </div>
            <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600">Support</div>
          </div>

          <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
            {helpNotes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Card>
  );
}
