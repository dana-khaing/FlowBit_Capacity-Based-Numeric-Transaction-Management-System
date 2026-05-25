"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImagePortrait, faRotate, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { uploadProfileAvatar, type AuthUser } from "@/lib/auth-client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";

type ProfileAvatarCardProps = {
  user: AuthUser;
  onUserChange: (user: AuthUser) => void;
  onNotify: (message: string) => void;
};

export function ProfileAvatarCard({ user, onUserChange, onNotify }: ProfileAvatarCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function uploadSelectedFile(file: File) {
    setErrorMessage("");
    setIsUploading(true);

    try {
      const updatedUser = await uploadProfileAvatar(file);
      onUserChange(updatedUser);
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      onNotify("Profile photo updated successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to upload profile photo.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setErrorMessage("");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    void uploadSelectedFile(file);
  }

  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Avatar</p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">Profile photo</h2>
      </div>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Selected profile preview"
              className="h-20 w-20 rounded-[28px] object-cover"
            />
          ) : (
            <ProfileAvatar user={user} />
          )}
          {isUploading ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-stone-950/55 text-white">
              <FontAwesomeIcon icon={faSpinner} className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
        </div>
        <div className="flex-1">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-[20px] border border-stone-900/10 bg-[#f8f6f2] px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100">
            <FontAwesomeIcon icon={selectedFile ? faRotate : faImagePortrait} className="h-4 w-4" />
            {user.avatar_url ? "Replace photo" : "Choose photo"}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
          <p className="mt-3 text-sm text-stone-500">
            {isUploading
              ? `Uploading ${selectedFile?.name || "photo"}...`
              : selectedFile
                ? `${selectedFile.name} selected. Uploading now.`
                : "Upload a clear square image for the best result."}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-400">
            {previewUrl ? "Previewing selected photo" : "Image updates everywhere after upload"}
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
