"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faFloppyDisk, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { AuthInput } from "@/components/auth/auth-input";
import { Button } from "@/components/ui/button";
import { updateCurrentUserProfile, type AuthUser } from "@/lib/auth-client";

type ProfileDetailsCardProps = {
  user: AuthUser;
  onUserChange: (user: AuthUser) => void;
  onNotify: (message: string) => void;
};

function normalizeProfileForm(values: {
  full_name: string;
  username: string;
  email: string;
  phone_number: string;
}) {
  return {
    full_name: values.full_name.trim(),
    username: values.username.trim(),
    email: values.email.trim(),
    phone_number: values.phone_number.trim(),
  };
}

export function ProfileDetailsCard({ user, onUserChange, onNotify }: ProfileDetailsCardProps) {
  const [formValues, setFormValues] = useState({
    full_name: user.full_name || "",
    username: user.username,
    email: user.email || "",
    phone_number: user.phone_number || "",
  });
  const [fieldErrors, setFieldErrors] = useState<{
    full_name?: string;
    username?: string;
    email?: string;
    phone_number?: string;
  }>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const normalizedInitialValues = useMemo(
    () =>
      normalizeProfileForm({
        full_name: user.full_name || "",
        username: user.username,
        email: user.email || "",
        phone_number: user.phone_number || "",
      }),
    [user.full_name, user.username, user.email, user.phone_number],
  );
  const normalizedFormValues = useMemo(() => normalizeProfileForm(formValues), [formValues]);
  const hasChanges =
    normalizedFormValues.full_name !== normalizedInitialValues.full_name ||
    normalizedFormValues.username !== normalizedInitialValues.username ||
    normalizedFormValues.email !== normalizedInitialValues.email ||
    normalizedFormValues.phone_number !== normalizedInitialValues.phone_number;

  useEffect(() => {
    if (hasChanges || isSaving) {
      return;
    }

    setFormValues({
      full_name: user.full_name || "",
      username: user.username,
      email: user.email || "",
      phone_number: user.phone_number || "",
    });
  }, [user.full_name, user.username, user.email, user.phone_number, hasChanges, isSaving]);

  function validateForm() {
    const nextErrors: {
      full_name?: string;
      username?: string;
      email?: string;
      phone_number?: string;
    } = {};

    if (!formValues.full_name.trim()) {
      nextErrors.full_name = "Enter your full name.";
    } else if (formValues.full_name.trim().length < 2) {
      nextErrors.full_name = "Use at least 2 characters.";
    }

    if (!formValues.username.trim()) {
      nextErrors.username = "Enter your username.";
    } else if (!/^[A-Za-z0-9._]+$/.test(formValues.username.trim())) {
      nextErrors.username = "Use letters, numbers, dots, or underscores only.";
    } else if (formValues.username.trim().length < 3) {
      nextErrors.username = "Use at least 3 characters.";
    }

    if (!formValues.email.trim()) {
      nextErrors.email = "Enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    const trimmedPhoneNumber = formValues.phone_number.trim();
    if (trimmedPhoneNumber && !/^[0-9+()\-\s]+$/.test(trimmedPhoneNumber)) {
      nextErrors.phone_number = "Use digits and standard phone symbols only.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    setErrorMessage("");

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      const updatedUser = await updateCurrentUserProfile(normalizedFormValues);
      onUserChange(updatedUser);
      setFormValues({
        full_name: updatedUser.full_name || "",
        username: updatedUser.username,
        email: updatedUser.email || "",
        phone_number: updatedUser.phone_number || "",
      });
      onNotify("Profile updated successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update your profile.";
      if (message.toLowerCase().includes("username")) {
        setFieldErrors((current) => ({ ...current, username: message }));
      } else if (message.toLowerCase().includes("email")) {
        setFieldErrors((current) => ({ ...current, email: message }));
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Account Details</p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">Edit profile information</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Update the account details shown across your FlowBit workspace. Changes stay local until you save them.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-stone-900/8 bg-[#f8f6f2] p-5">
        <div className="flex flex-col gap-3 rounded-[20px] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-stone-900">Profile editing</p>
            <p className="mt-1 text-sm text-stone-500">
              {hasChanges ? "You have unsaved changes." : "Everything is saved and up to date."}
            </p>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
              hasChanges
                ? "bg-amber-100 text-amber-900"
                : "bg-emerald-100 text-emerald-900"
            }`}
          >
            <FontAwesomeIcon icon={hasChanges ? faPenToSquare : faCircleCheck} className="h-3.5 w-3.5" />
            {hasChanges ? "Needs save" : "Saved"}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[20px] bg-white p-4">
            <p className="text-sm font-semibold text-stone-900">Identity details</p>
            <div className="mt-4 grid gap-4">
              <AuthInput
                label="Full name"
                type="text"
                placeholder="Enter your full name"
                value={formValues.full_name}
                error={fieldErrors.full_name}
                hint="This name appears across your FlowBit workspace."
                onChange={(event) => {
                  setFormValues((current) => ({ ...current, full_name: event.target.value }));
                  setFieldErrors((current) => ({ ...current, full_name: undefined }));
                }}
              />

              <AuthInput
                label="Username"
                type="text"
                placeholder="Enter your username"
                value={formValues.username}
                error={fieldErrors.username}
                hint="Use letters, numbers, dots, or underscores."
                onChange={(event) => {
                  setFormValues((current) => ({ ...current, username: event.target.value }));
                  setFieldErrors((current) => ({ ...current, username: undefined }));
                }}
              />
            </div>
          </div>

          <div className="rounded-[20px] bg-white p-4">
            <p className="text-sm font-semibold text-stone-900">Contact details</p>
            <div className="mt-4 grid gap-4">
            <AuthInput
              label="Email address"
              type="email"
              placeholder="Enter your email address"
              autoComplete="email"
              value={formValues.email}
              error={fieldErrors.email}
              onChange={(event) => {
                setFormValues((current) => ({ ...current, email: event.target.value }));
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
            />

            <AuthInput
              label="Phone number"
              type="tel"
              placeholder="Enter your phone number"
              inputMode="tel"
              value={formValues.phone_number}
              error={fieldErrors.phone_number}
              hint="Optional. Use digits, spaces, +, -, or parentheses."
              onChange={(event) => {
                setFormValues((current) => ({ ...current, phone_number: event.target.value }));
                setFieldErrors((current) => ({ ...current, phone_number: undefined }));
              }}
            />
            </div>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-500">
          {hasChanges ? "Save now to publish your updated profile details." : "No pending edits."}
        </p>
        <Button size="lg" onClick={handleSave} disabled={isSaving || !hasChanges}>
          <FontAwesomeIcon icon={faFloppyDisk} className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </section>
  );
}
