"use client";

import { useEffect, useState } from "react";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { AdminAccessGuard } from "@/components/admin/admin-access-guard";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { OverrideCodeInput } from "@/components/admin/override-code-input";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { Button } from "@/components/ui/button";
import { fetchCurrentUser, requestOverrideCodeReset, type AuthUser } from "@/lib/auth-client";
import { updateManagedUserOverride } from "@/lib/admin-client";

type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

export function AdminOverrideCodesPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [oldOverrideCode, setOldOverrideCode] = useState("");
  const [newOverrideCode, setNewOverrideCode] = useState("");
  const [pending, setPending] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch((error) =>
        setToast({ message: error instanceof Error ? error.message : "Could not load your admin profile.", type: "error" }),
      );
  }, []);

  function requireCurrentCode() {
    const normalizedCode = oldOverrideCode.trim();
    if (!user?.has_override_code) {
      return "";
    }
    if (!normalizedCode) {
      setToast({
        message: "Enter your current 4-digit override code before activating a new one.",
        type: "error",
      });
      return null;
    }
    return normalizedCode;
  }

  function handleActivate() {
    if (!user) {
      return;
    }

    const nextCode = newOverrideCode.trim();
    if (!nextCode) {
      setToast({ message: "Enter the new 4-digit override code before activating the change.", type: "error" });
      return;
    }
    const currentCode = requireCurrentCode();
    if (currentCode === null) {
      return;
    }
    setShowConfirm(true);
  }

  async function confirmOverrideUpdate() {
    if (!user) {
      return;
    }

    const currentCode = requireCurrentCode();
    if (currentCode === null) {
      return;
    }
    const nextCode = newOverrideCode.trim();
    if (!nextCode) {
      setToast({ message: "Enter the new 4-digit override code before activating the change.", type: "error" });
      return;
    }

    setPending(true);
    setToast(null);
    try {
      const response = await updateManagedUserOverride(user.id, nextCode, {
        adminOverrideCode: currentCode,
      });
      setToast({ message: response.message, type: "success" });
      setUser((current) => (current ? { ...current, has_override_code: true } : current));
      setOldOverrideCode("");
      setNewOverrideCode("");
      setShowConfirm(false);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Override update failed.", type: "error" });
    } finally {
      setPending(false);
    }
  }

  async function handleForgotOverrideCode() {
    setToast(null);
    setIsSendingReset(true);
    try {
      const response = await requestOverrideCodeReset();
      setToast({ message: response.message, type: "success" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Could not send the override reset email.", type: "error" });
    } finally {
      setIsSendingReset(false);
    }
  }

  return (
    <AdminAccessGuard>
      {(currentAdmin) => (
        <WorkspaceShell>
          {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
          <AdminConfirmModal
            open={showConfirm}
            title={`Activate override code for ${currentAdmin.username}`}
            description="Confirm the override code change for your admin account."
            confirmLabel={currentAdmin.has_override_code ? "Activate" : "Set up"}
            showCodeInput={false}
            busy={pending}
            onCodeChange={() => {}}
            onCancel={() => setShowConfirm(false)}
            onConfirm={confirmOverrideUpdate}
          />

          <div className="mx-auto w-full max-w-[1800px] px-4 py-2 sm:px-6 lg:px-8 lg:py-5">
            <AdminPageHeader
              eyebrow="Admin"
              title="Manage override code"
              description="Set up your first 4-digit admin override code, or rotate your existing one by supplying the current code and a new code."
            />

            <section className="mt-5 rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="rounded-[24px] border border-stone-900/8 bg-[#f8f6f2] p-4 sm:p-5">
                <div className="grid gap-5 xl:grid-cols-2 xl:gap-8">
                  <div className="space-y-1 xl:min-w-0">
                    <p className="text-lg font-semibold text-stone-950">{currentAdmin.full_name || currentAdmin.username}</p>
                    <p className="text-sm text-stone-500">@{currentAdmin.username}</p>
                    <p className="text-sm text-stone-500">{currentAdmin.email || "No email"}</p>
                    <p className="text-sm text-stone-500">
                      {currentAdmin.has_override_code ? "Override code already configured" : "No override code configured yet"}
                    </p>
                    {currentAdmin.has_override_code ? (
                      <div className="pt-3">
                        <button
                          type="button"
                          onClick={() => void handleForgotOverrideCode()}
                          disabled={isSendingReset || pending}
                          className="text-sm font-medium text-[#b66427] underline underline-offset-4 disabled:opacity-60"
                        >
                          {isSendingReset ? "Sending reset email..." : "Forgot override code?"}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-4 xl:min-w-0">
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                        {currentAdmin.has_override_code ? "Old override code" : "Initial setup"}
                      </span>
                      {currentAdmin.has_override_code ? (
                        <div className="space-y-2">
                          <OverrideCodeInput value={oldOverrideCode} onChange={setOldOverrideCode} disabled={pending} />
                          <p className="text-sm text-stone-500">
                            Enter your current 4-digit override code.
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-stone-900/10 bg-white/70 px-4 py-3 text-sm text-stone-500">
                          You do not have an override code yet. Set your first code below.
                        </div>
                      )}
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                        New override code
                      </span>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_164px]">
                        <div className="space-y-2">
                          <OverrideCodeInput value={newOverrideCode} onChange={setNewOverrideCode} disabled={pending} />
                          <p className="text-sm text-stone-500">Only 4 digits are allowed.</p>
                        </div>
                        <Button className="w-full" onClick={handleActivate} disabled={pending}>
                          {currentAdmin.has_override_code ? "Activate" : "Set up"}
                        </Button>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </WorkspaceShell>
      )}
    </AdminAccessGuard>
  );
}
