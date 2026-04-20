"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
import { AuthInput } from "@/components/auth/auth-input";
import { Button } from "@/components/ui/button";
import { updateCurrentUserProfile, type AuthUser } from "@/lib/auth-client";

type ProfileDetailsCardProps = {
  user: AuthUser;
  onUserChange: (user: AuthUser) => void;
};

export function ProfileDetailsCard({ user, onUserChange }: ProfileDetailsCardProps) {
  const [formValues, setFormValues] = useState({
    full_name: user.full_name || "",
    username: user.username,
    phone_number: user.phone_number || "",
  });
  const [fieldErrors, setFieldErrors] = useState<{ full_name?: string; username?: string }>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function validateForm() {
    const nextErrors: { full_name?: string; username?: string } = {};

    if (!formValues.full_name.trim()) {
      nextErrors.full_name = "Enter your full name.";
    }

    if (!formValues.username.trim()) {
      nextErrors.username = "Enter your username.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    setErrorMessage("");
    setSuccessMessage("");

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      const updatedUser = await updateCurrentUserProfile(formValues);
      onUserChange(updatedUser);
      setFormValues({
        full_name: updatedUser.full_name || "",
        username: updatedUser.username,
        phone_number: updatedUser.phone_number || "",
      });
      setSuccessMessage("Profile updated successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update your profile.");
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
          You can update your full name, username, and phone number here.
        </p>
      </div>

      <div className="mt-6 grid gap-4 rounded-[24px] border border-stone-900/8 bg-[#f8f6f2] p-5">
        <AuthInput
          label="Full name"
          type="text"
          placeholder="Enter your full name"
          value={formValues.full_name}
          error={fieldErrors.full_name}
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
          onChange={(event) => {
            setFormValues((current) => ({ ...current, username: event.target.value }));
            setFieldErrors((current) => ({ ...current, username: undefined }));
          }}
        />

        <AuthInput
          label="Phone number"
          type="tel"
          placeholder="Enter your phone number"
          inputMode="tel"
          value={formValues.phone_number}
          onChange={(event) => {
            setFormValues((current) => ({ ...current, phone_number: event.target.value }));
          }}
        />

        <div className="rounded-[20px] border border-stone-900/8 bg-white px-4 py-4">
          <p className="text-sm font-medium text-stone-500">Email address</p>
          <p className="mt-2 text-base text-stone-900">{user.email || "Not provided"}</p>
        </div>
      </div>

      {successMessage ? (
        <div className="mt-5 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5">
        <Button size="lg" onClick={handleSave} disabled={isSaving}>
          <FontAwesomeIcon icon={faFloppyDisk} className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </section>
  );
}
