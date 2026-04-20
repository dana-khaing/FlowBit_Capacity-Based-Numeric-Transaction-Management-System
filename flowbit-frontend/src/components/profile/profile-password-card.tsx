"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey } from "@fortawesome/free-solid-svg-icons";
import { AuthInput } from "@/components/auth/auth-input";
import { Button } from "@/components/ui/button";
import { changePassword } from "@/lib/auth-client";

type ProfilePasswordCardProps = {
  onNotify: (message: string) => void;
};

export function ProfilePasswordCard({ onNotify }: ProfilePasswordCardProps) {
  const [formValues, setFormValues] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<{
    current_password?: string;
    new_password?: string;
    confirm_password?: string;
  }>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validateForm() {
    const nextErrors: {
      current_password?: string;
      new_password?: string;
      confirm_password?: string;
    } = {};

    if (!formValues.current_password) {
      nextErrors.current_password = "Enter your current password.";
    }
    if (!formValues.new_password) {
      nextErrors.new_password = "Enter your new password.";
    } else if (formValues.new_password.length < 8) {
      nextErrors.new_password = "Use at least 8 characters.";
    }
    if (!formValues.confirm_password) {
      nextErrors.confirm_password = "Confirm your new password.";
    } else if (formValues.confirm_password !== formValues.new_password) {
      nextErrors.confirm_password = "Passwords do not match.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleChangePassword() {
    setErrorMessage("");

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword({
        current_password: formValues.current_password,
        new_password: formValues.new_password,
      });
      onNotify("Password changed successfully.");
      setFormValues({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to change your password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Password</p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">Change password</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Update your password without leaving the profile page.
        </p>
      </div>

      <div className="mt-5 grid gap-4">
        <AuthInput
          label="Current password"
          type="password"
          placeholder="Enter your current password"
          autoComplete="current-password"
          value={formValues.current_password}
          error={fieldErrors.current_password}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, current_password: event.target.value }));
            setFieldErrors((current) => ({ ...current, current_password: undefined }));
          }}
        />
        <AuthInput
          label="New password"
          type="password"
          placeholder="Enter your new password"
          autoComplete="new-password"
          hint="Use at least 8 characters."
          value={formValues.new_password}
          error={fieldErrors.new_password}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, new_password: event.target.value }));
            setFieldErrors((current) => ({ ...current, new_password: undefined }));
          }}
        />
        <AuthInput
          label="Confirm new password"
          type="password"
          placeholder="Confirm your new password"
          autoComplete="new-password"
          value={formValues.confirm_password}
          error={fieldErrors.confirm_password}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, confirm_password: event.target.value }));
            setFieldErrors((current) => ({ ...current, confirm_password: undefined }));
          }}
        />
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5">
        <Button size="lg" onClick={handleChangePassword} disabled={isSubmitting}>
          <FontAwesomeIcon icon={faKey} className="h-4 w-4" />
          {isSubmitting ? "Changing password..." : "Change password"}
        </Button>
      </div>
    </section>
  );
}
