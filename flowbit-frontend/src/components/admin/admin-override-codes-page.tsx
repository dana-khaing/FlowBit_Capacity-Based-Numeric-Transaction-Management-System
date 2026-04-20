"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { AdminAccessGuard } from "@/components/admin/admin-access-guard";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchManagedUsers, updateManagedUserOverride, type ManagedUser } from "@/lib/admin-client";

type OverrideDraftState = Record<number, string>;
type OldOverrideDraftState = Record<number, string>;
type BusyState = Record<number, boolean>;
type ToastState = {
  message: string;
  type: "success" | "error";
} | null;
type PendingActionState =
  | {
      type: "override";
      userId: number;
      username: string;
    }
  | null;

export function AdminOverrideCodesPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [busyMap, setBusyMap] = useState<BusyState>({});
  const [oldOverrideDrafts, setOldOverrideDrafts] = useState<OldOverrideDraftState>({});
  const [newOverrideDrafts, setNewOverrideDrafts] = useState<OverrideDraftState>({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionState>(null);

  useEffect(() => {
    fetchManagedUsers()
      .then((data) => setUsers(data.filter((user) => user.role === "admin")))
      .catch((error) =>
        setToast({ message: error instanceof Error ? error.message : "Could not load admin accounts.", type: "error" }),
      );
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return users;
    }

    return users.filter((user) =>
      [user.full_name, user.username, user.email].some((value) => value.toLowerCase().includes(query)),
    );
  }, [search, users]);

  function setBusy(userId: number, isBusy: boolean) {
    setBusyMap((current) => ({ ...current, [userId]: isBusy }));
  }

  function requireCurrentCode(user: ManagedUser) {
    const rawCode = (oldOverrideDrafts[user.id] || "").trim();
    if (!user.has_override_code) {
      return "";
    }
    if (!rawCode) {
      setToast({
        message: "Enter the current override code before activating a new one.",
        type: "error",
      });
      return null;
    }
    return rawCode;
  }

  function handleActivate(userId: number) {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }

    const newCode = (newOverrideDrafts[userId] || "").trim();
    if (!newCode) {
      setToast({ message: "Enter the new override code before activating the change.", type: "error" });
      return;
    }
    const currentCode = requireCurrentCode(targetUser);
    if (currentCode === null) {
      return;
    }

    setPendingAction({ type: "override", userId, username: targetUser.username });
  }

  async function confirmOverrideUpdate() {
    if (!pendingAction || pendingAction.type !== "override") {
      return;
    }

    const targetUser = users.find((user) => user.id === pendingAction.userId);
    if (!targetUser) {
      return;
    }

    const currentCode = requireCurrentCode(targetUser);
    if (currentCode === null) {
      return;
    }

    const newCode = (newOverrideDrafts[targetUser.id] || "").trim();
    if (!newCode) {
      setToast({ message: "Enter the new override code before activating the change.", type: "error" });
      return;
    }

    setBusy(targetUser.id, true);
    setToast(null);
    try {
      const response = await updateManagedUserOverride(targetUser.id, newCode, {
        adminOverrideCode: currentCode,
      });
      setToast({ message: response.message, type: "success" });
      setUsers((current) =>
        current.map((user) => (user.id === targetUser.id ? { ...user, has_override_code: true } : user)),
      );
      setOldOverrideDrafts((current) => ({ ...current, [targetUser.id]: "" }));
      setNewOverrideDrafts((current) => ({ ...current, [targetUser.id]: "" }));
      setPendingAction(null);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Override update failed.", type: "error" });
    } finally {
      setBusy(targetUser.id, false);
    }
  }

  return (
    <AdminAccessGuard>
      {() => (
        <WorkspaceShell>
          {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
          <AdminConfirmModal
            open={pendingAction !== null}
            title={pendingAction ? `Activate override code for ${pendingAction.username}` : "Confirm action"}
            description="Confirm this override code change for the selected admin account."
            confirmLabel="Activate"
            showCodeInput={false}
            busy={pendingAction ? Boolean(busyMap[pendingAction.userId]) : false}
            onCodeChange={() => {}}
            onCancel={() => setPendingAction(null)}
            onConfirm={confirmOverrideUpdate}
          />

          <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
            <AdminPageHeader
              eyebrow="Admin"
              title="Manage override code"
              description="Create the first override code for an admin account, or rotate an existing one by supplying the current code and a new code."
            />

            <section className="mt-5 rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-stone-950">Admin accounts</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-500">
                    Accounts without an override code can be set up directly. Existing codes require the current code first.
                  </p>
                </div>
                <div className="w-full max-w-sm">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search admin users"
                    aria-label="Search admin users"
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                {filteredUsers.map((user) => {
                  const isBusy = Boolean(busyMap[user.id]);
                  return (
                    <article
                      key={user.id}
                      className="rounded-[24px] border border-stone-900/8 bg-[#f8f6f2] p-4 sm:p-5"
                    >
                      <div className="grid gap-5 xl:grid-cols-2 xl:gap-8">
                        <div className="space-y-1 xl:min-w-0">
                          <p className="text-lg font-semibold text-stone-950">{user.full_name || user.username}</p>
                          <p className="text-sm text-stone-500">@{user.username}</p>
                          <p className="text-sm text-stone-500">{user.email || "No email"}</p>
                          <p className="text-sm text-stone-500">
                            {user.has_override_code ? "Override code already configured" : "No override code configured yet"}
                          </p>
                        </div>

                        <div className="grid gap-4 xl:min-w-0">
                          <label className="space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                              {user.has_override_code ? "Old override code" : "Initial setup"}
                            </span>
                            {user.has_override_code ? (
                              <Input
                                type="password"
                                value={oldOverrideDrafts[user.id] || ""}
                                onChange={(event) =>
                                  setOldOverrideDrafts((current) => ({ ...current, [user.id]: event.target.value }))
                                }
                                placeholder="Enter current override code"
                                disabled={isBusy}
                              />
                            ) : (
                              <div className="rounded-[18px] border border-dashed border-stone-900/10 bg-white/70 px-4 py-3 text-sm text-stone-500">
                                This admin does not have an override code yet. Set the first code below.
                              </div>
                            )}
                          </label>

                          <label className="space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                              New override code
                            </span>
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_164px]">
                              <Input
                                type="password"
                                value={newOverrideDrafts[user.id] || ""}
                                onChange={(event) =>
                                  setNewOverrideDrafts((current) => ({ ...current, [user.id]: event.target.value }))
                                }
                                placeholder={user.has_override_code ? "Enter new override code" : "Set first override code"}
                                disabled={isBusy}
                              />
                              <Button className="w-full" onClick={() => handleActivate(user.id)} disabled={isBusy}>
                                {user.has_override_code ? "Activate" : "Set up"}
                              </Button>
                            </div>
                          </label>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {!filteredUsers.length ? (
                  <div className="rounded-[24px] border border-dashed border-stone-900/12 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                    No admin accounts matched your search.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </WorkspaceShell>
      )}
    </AdminAccessGuard>
  );
}
