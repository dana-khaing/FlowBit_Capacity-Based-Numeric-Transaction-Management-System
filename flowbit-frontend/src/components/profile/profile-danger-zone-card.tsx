"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { OverrideCodeInput } from "@/components/admin/override-code-input";
import { Button } from "@/components/ui/button";
import { ProfileDeleteModal } from "@/components/profile/profile-delete-modal";
import { clearStoredSession, deleteCurrentUserAccount, type AuthUser } from "@/lib/auth-client";

type ProfileDangerZoneCardProps = {
  user: AuthUser;
};

export function ProfileDangerZoneCard({ user }: ProfileDangerZoneCardProps) {
  const router = useRouter();
  const [adminOverrideCode, setAdminOverrideCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  async function handleDeleteAccount() {
    setErrorMessage("");
    setIsDeleting(true);

    try {
      await deleteCurrentUserAccount({ admin_override_code: adminOverrideCode });
      clearStoredSession();
      router.push("/login");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete your account.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-red-200 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-red-500">Danger Zone</p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-950">Delete account</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            This permanently removes the account for <span className="font-medium">{user.full_name || user.username}</span>.
            Regular users need a valid admin override code.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <Button
          size="lg"
          variant="outline"
          className="border-red-200 text-red-700 hover:bg-red-50"
          onClick={() => setShowConfirmModal(true)}
          disabled={isDeleting}
        >
          <FontAwesomeIcon icon={faTrashCan} className="h-4 w-4" />
          {isDeleting ? "Deleting account..." : "Delete account"}
        </Button>
      </div>

      <ProfileDeleteModal
        title="Delete this FlowBit account?"
        description="This action permanently removes the account and signs you out immediately."
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleDeleteAccount}
        confirmLabel="Confirm account deletion"
        isSubmitting={isDeleting}
      >
        {!user.role || user.role !== "admin" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-stone-600">Admin override code</p>
            <OverrideCodeInput value={adminOverrideCode} onChange={setAdminOverrideCode} autoFocus />
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorMessage}
          </div>
        ) : null}
      </ProfileDeleteModal>
    </section>
  );
}
