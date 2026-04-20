"use client";

import { ChangeEvent, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImagePortrait, faUpload } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { uploadProfileAvatar, type AuthUser } from "@/lib/auth-client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";

type ProfileAvatarCardProps = {
  user: AuthUser;
  onUserChange: (user: AuthUser) => void;
};

export function ProfileAvatarCard({ user, onUserChange }: ProfileAvatarCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] || null);
    setSuccessMessage("");
    setErrorMessage("");
  }

  async function handleUpload() {
    if (!selectedFile) {
      setErrorMessage("Choose an image to upload.");
      return;
    }

    setSuccessMessage("");
    setErrorMessage("");
    setIsUploading(true);

    try {
      const updatedUser = await uploadProfileAvatar(selectedFile);
      onUserChange(updatedUser);
      setSelectedFile(null);
      setSuccessMessage("Profile photo updated successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to upload profile photo.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Avatar</p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">Profile photo</h2>
      </div>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
        <ProfileAvatar user={user} />
        <div className="flex-1">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-[20px] border border-stone-900/10 bg-[#f8f6f2] px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100">
            <FontAwesomeIcon icon={faImagePortrait} className="h-4 w-4" />
            Choose photo
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
          <p className="mt-3 text-sm text-stone-500">
            {selectedFile ? selectedFile.name : "Upload a clear square image for the best result."}
          </p>
          <div className="mt-4">
            <Button size="lg" onClick={handleUpload} disabled={isUploading || !selectedFile}>
              <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
              {isUploading ? "Uploading..." : "Upload photo"}
            </Button>
          </div>
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
    </section>
  );
}
