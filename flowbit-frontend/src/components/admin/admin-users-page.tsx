"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { AdminAccessGuard } from "@/components/admin/admin-access-guard";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteManagedUser,
  fetchManagedUsers,
  updateManagedUserOverride,
  updateManagedUserRole,
  type ManagedUser,
} from "@/lib/admin-client";

type OverrideDraftState = Record<number, string>;
type OldOverrideDraftState = Record<number, string>;
type BusyState = Record<number, boolean>;
type ToastState = {
  message: string;
  type: "success" | "error";
} | null;
type PendingActionState =
  | {
      type: "role";
      userId: number;
      username: string;
      role: string;
    }
  | {
      type: "delete";
      userId: number;
      username: string;
      isSelf: boolean;
    }
  | null;

export function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [busyMap, setBusyMap] = useState<BusyState>({});
  const [overrideDrafts, setOverrideDrafts] = useState<OverrideDraftState>({});
  const [oldOverrideDrafts, setOldOverrideDrafts] = useState<OldOverrideDraftState>({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionState>(null);
  const [pendingActionCode, setPendingActionCode] = useState("");

  useEffect(() => {
    fetchManagedUsers()
      .then(setUsers)
      .catch((error) =>
        setToast({ message: error instanceof Error ? error.message : "Could not load users.", type: "error" }),
      );
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return users;
    }

    return users.filter((user) =>
      [user.full_name, user.username, user.email, user.role].some((value) => value.toLowerCase().includes(query)),
    );
  }, [search, users]);

  function setBusy(userId: number, isBusy: boolean) {
    setBusyMap((current) => ({ ...current, [userId]: isBusy }));
  }

  function requireAuthorizationCode(rawCode: string) {
    const normalizedCode = rawCode.trim();
    if (!normalizedCode) {
      setToast({
        message: "Enter your admin override code before changing or deleting a user.",
        type: "error",
      });
      return null;
    }
    return normalizedCode;
  }

  function handleRoleChange(userId: number, role: string) {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }

    setPendingAction({
      type: "role",
      userId,
      username: targetUser.username,
      role,
    });
    setPendingActionCode("");
  }

  async function confirmRoleChange() {
    if (!pendingAction || pendingAction.type !== "role") {
      return;
    }

    const authorizationCode = requireAuthorizationCode(pendingActionCode);
    if (!authorizationCode) {
      return;
    }

    const { userId, role } = pendingAction;
    setBusy(userId, true);
    setToast(null);
    try {
      const response = await updateManagedUserRole(userId, role, { adminOverrideCode: authorizationCode });
      setUsers((current) => current.map((user) => (user.id === userId ? response.user : user)));
      setToast({ message: response.message, type: "success" });
      setPendingAction(null);
      setPendingActionCode("");
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Role update failed.", type: "error" });
    } finally {
      setBusy(userId, false);
    }
  }

  async function handleOverrideUpdate(userId: number) {
    const authorizationCode = requireAuthorizationCode(oldOverrideDrafts[userId] || "");
    if (!authorizationCode) {
      return;
    }
    const targetUser = users.find((user) => user.id === userId);
    const newOverrideCode = (overrideDrafts[userId] || "").trim();
    if (!targetUser) {
      return;
    }
    if (!newOverrideCode) {
      setToast({ message: "Enter the new override code before activating the change.", type: "error" });
      return;
    }
    if (!window.confirm(`Update the override code for ${targetUser.username}?`)) {
      return;
    }

    setBusy(userId, true);
    setToast(null);
    try {
      const response = await updateManagedUserOverride(userId, newOverrideCode, {
        adminOverrideCode: authorizationCode,
      });
      setToast({ message: response.message, type: "success" });
      setOverrideDrafts((current) => ({ ...current, [userId]: "" }));
      setOldOverrideDrafts((current) => ({ ...current, [userId]: "" }));
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Override update failed.", type: "error" });
    } finally {
      setBusy(userId, false);
    }
  }

  function handleDelete(userId: number, isSelf: boolean) {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }

    setPendingAction({
      type: "delete",
      userId,
      username: targetUser.username,
      isSelf,
    });
    setPendingActionCode("");
  }

  async function confirmDelete() {
    if (!pendingAction || pendingAction.type !== "delete") {
      return;
    }

    const authorizationCode = requireAuthorizationCode(pendingActionCode);
    if (!authorizationCode) {
      return;
    }

    const { userId } = pendingAction;
    setBusy(userId, true);
    setToast(null);
    try {
      const response = await deleteManagedUser(userId, { adminOverrideCode: authorizationCode });
      setUsers((current) => current.filter((user) => user.id !== userId));
      setToast({ message: response.message, type: "success" });
      setPendingAction(null);
      setPendingActionCode("");
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Account deletion failed.", type: "error" });
    } finally {
      setBusy(userId, false);
    }
  }

  return (
    <AdminAccessGuard>
      {(currentAdmin) => (
        <WorkspaceShell>
          {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
          <AdminConfirmModal
            open={pendingAction !== null}
            title={
              pendingAction?.type === "delete"
                ? pendingAction.isSelf
                  ? "Delete your account"
                  : `Delete ${pendingAction.username}`
                : pendingAction?.type === "role"
                  ? `Change ${pendingAction.username}`
                  : "Confirm action"
            }
            description={
              pendingAction?.type === "delete"
                ? pendingAction.isSelf
                  ? "Enter your current override code to confirm deleting your own account."
                  : "Enter your current override code to confirm deleting this account."
                : pendingAction?.type === "role"
                  ? `Enter your current override code to change this account to ${pendingAction.role}.`
                  : ""
            }
            codeLabel="Current override code"
            codeValue={pendingActionCode}
            confirmLabel={pendingAction?.type === "delete" ? "Delete" : "Confirm"}
            busy={pendingAction ? Boolean(busyMap[pendingAction.userId]) : false}
            onCodeChange={setPendingActionCode}
            onCancel={() => {
              setPendingAction(null);
              setPendingActionCode("");
            }}
            onConfirm={pendingAction?.type === "delete" ? confirmDelete : confirmRoleChange}
          />
          <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
            <AdminPageHeader
              eyebrow="Admin"
              title="User management"
              description="Review active accounts, update role access, manage override codes for admin users, and remove accounts when needed."
            />

            <section className="mt-5 rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-stone-950">Accounts</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-500">
                    Search by name, username, email, or role. User changes ask for your current override code before they are applied.
                  </p>
                </div>
                <div className="w-full max-w-sm">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search users"
                    aria-label="Search users"
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                {filteredUsers.map((user) => {
                  const isBusy = Boolean(busyMap[user.id]);
                  const isCurrentAdmin = currentAdmin.id === user.id;
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
                          <p className="text-sm text-stone-500">{user.phone_number || "No phone number"}</p>
                        </div>

                        <div className="grid gap-4 xl:min-w-0">
                          <label className="space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Role</span>
                            <select
                              value={user.role}
                              onChange={(event) => handleRoleChange(user.id, event.target.value)}
                              disabled={isBusy}
                              className="flex h-12 w-full rounded-[18px] border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-stone-950"
                            >
                              <option value="user" disabled={isCurrentAdmin && user.role === "admin"}>
                                User
                              </option>
                              <option value="admin">Admin</option>
                            </select>
                            {isCurrentAdmin && user.role === "admin" ? (
                              <p className="min-h-[20px] text-xs leading-5 text-stone-500">
                                Your own admin account cannot be downgraded here.
                              </p>
                            ) : (
                              <div className="min-h-[20px]" aria-hidden="true" />
                            )}
                          </label>

                          <label className="space-y-2 sm:col-span-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                              {user.role === "admin" ? "Old override code" : "Admin override code"}
                            </span>
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_164px]">
                              <Input
                                type="password"
                                value={user.role === "admin" ? oldOverrideDrafts[user.id] || "" : overrideDrafts[user.id] || ""}
                                onChange={(event) =>
                                  user.role === "admin"
                                    ? setOldOverrideDrafts((current) => ({ ...current, [user.id]: event.target.value }))
                                    : setOverrideDrafts((current) => ({ ...current, [user.id]: event.target.value }))
                                }
                                placeholder={user.role === "admin" ? "Enter current override code" : "Available for admin only"}
                                disabled={isBusy || user.role !== "admin"}
                              />
                              <Button
                                className="w-full"
                                onClick={() => handleOverrideUpdate(user.id)}
                                disabled={isBusy || user.role !== "admin"}
                              >
                                {user.role === "admin" ? "Activate" : "Modify"}
                              </Button>
                            </div>
                            {user.role === "admin" ? (
                              <div className="space-y-2 pt-1">
                                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                                  New override code
                                </span>
                                <Input
                                  type="password"
                                  value={overrideDrafts[user.id] || ""}
                                  onChange={(event) =>
                                    setOverrideDrafts((current) => ({ ...current, [user.id]: event.target.value }))
                                  }
                                  placeholder="Enter new override code"
                                  disabled={isBusy}
                                />
                              </div>
                            ) : null}
                          </label>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-900/8 pt-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-stone-500">
                          Joined {new Date(user.date_joined).toLocaleDateString()}
                        </p>
                        <Button
                          variant="outline"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={() => handleDelete(user.id, isCurrentAdmin)}
                          disabled={isBusy}
                        >
                          Delete account
                        </Button>
                      </div>
                    </article>
                  );
                })}

                {!filteredUsers.length ? (
                  <div className="rounded-[24px] border border-dashed border-stone-900/12 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                    No users matched your search.
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
