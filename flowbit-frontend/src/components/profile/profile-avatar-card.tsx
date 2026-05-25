"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImagePortrait, faRotate, faSpinner, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { ProfileDeleteModal } from "@/components/profile/profile-delete-modal";
import { removeProfileAvatar, uploadProfileAvatar, type AuthUser } from "@/lib/auth-client";
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
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
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
      if (inputRef.current) {
        inputRef.current.value = "";
      }
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

  async function handleRemoveAvatar() {
    setErrorMessage("");
    setIsRemoving(true);

    try {
      const updatedUser = await removeProfileAvatar();
      onUserChange(updatedUser);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setSelectedFile(null);
      setShowRemoveConfirm(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      onNotify("Profile photo removed successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to remove profile photo.");
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Avatar</p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">Profile photo</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Keep your profile recognizable with a clear square photo. Changes apply across your FlowBit workspace.
        </p>
      </div>

      <div className="mt-6 rounded-[24px] bg-[#f8f6f2] p-5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Selected profile preview"
                  className="h-24 w-24 rounded-[30px] object-cover"
                />
              ) : (
                <ProfileAvatar user={user} className="h-24 w-24 rounded-[30px]" textClassName="text-3xl font-semibold" />
              )}
              {isUploading ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-[30px] bg-stone-950/55 text-white">
                  <FontAwesomeIcon icon={faSpinner} className="h-5 w-5 animate-spin" />
                </div>
              ) : null}
            </div>

            <div className="min-w-0">
              <p className="text-lg font-semibold text-stone-950">
                {user.full_name || user.username}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                {isUploading
                  ? `Uploading ${selectedFile?.name || "photo"}...`
                  : selectedFile
                    ? `${selectedFile.name} selected. Uploading now.`
                    : user.avatar_url
                      ? "Your current profile photo is active."
                      : "You are currently using initials as your avatar."}
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 lg:items-end">
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <Button
              size="default"
              variant="outline"
              className="min-w-[170px]"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading || isRemoving}
            >
              <FontAwesomeIcon icon={selectedFile ? faRotate : faImagePortrait} className="h-4 w-4" />
              {user.avatar_url ? "Replace photo" : "Choose photo"}
            </Button>

            <div className="flex flex-wrap gap-3 lg:justify-end">
              {user.avatar_url ? (
                <Button
                  size="default"
                  variant="outline"
                  className="min-w-[170px] border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => setShowRemoveConfirm(true)}
                  disabled={isUploading || isRemoving}
                >
                  <FontAwesomeIcon icon={faTrashCan} className="h-4 w-4" />
                  {isRemoving ? "Removing..." : "Remove photo"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage}
        </div>
      ) : null}

      <ProfileDeleteModal
        title="Remove current profile photo?"
        description="This clears your current avatar and switches the account back to initials everywhere in FlowBit."
        isOpen={showRemoveConfirm}
        onClose={() => {
          if (!isRemoving) {
            setShowRemoveConfirm(false);
          }
        }}
        onConfirm={handleRemoveAvatar}
        confirmLabel="Confirm photo removal"
        isSubmitting={isRemoving}
      >
        <p className="text-sm leading-6 text-stone-600">
          You can upload a new photo again at any time from this profile page.
        </p>
      </ProfileDeleteModal>
    </section>
  );
}
