"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { AdminAccessGuard } from "@/components/admin/admin-access-guard";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
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
type BusyState = Record<number, boolean>;

export function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [busyMap, setBusyMap] = useState<BusyState>({});
  const [overrideDrafts, setOverrideDrafts] = useState<OverrideDraftState>({});
  const [search, setSearch] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetchManagedUsers()
      .then(setUsers)
      .catch((error) => setErrorMessage(error.message));
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

  async function handleRoleChange(userId: number, role: string) {
    setBusy(userId, true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await updateManagedUserRole(userId, role);
      setUsers((current) => current.map((user) => (user.id === userId ? response.user : user)));
      setStatusMessage(response.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Role update failed.");
    } finally {
      setBusy(userId, false);
    }
  }

  async function handleOverrideUpdate(userId: number) {
    setBusy(userId, true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await updateManagedUserOverride(userId, overrideDrafts[userId] || "");
      setStatusMessage(response.message);
      setOverrideDrafts((current) => ({ ...current, [userId]: "" }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Override update failed.");
    } finally {
      setBusy(userId, false);
    }
  }

  async function handleDelete(userId: number) {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser || !window.confirm(`Delete ${targetUser.username}? This cannot be undone.`)) {
      return;
    }

    setBusy(userId, true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await deleteManagedUser(userId);
      setUsers((current) => current.filter((user) => user.id !== userId));
      setStatusMessage(response.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Account deletion failed.");
    } finally {
      setBusy(userId, false);
    }
  }

  return (
    <AdminAccessGuard>
      {() => (
        <WorkspaceShell>
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
                    Search by name, username, email, or role. Override codes can only be saved for admin accounts.
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

              {statusMessage ? <p className="mt-4 text-sm font-medium text-emerald-700">{statusMessage}</p> : null}
              {errorMessage ? <p className="mt-4 text-sm font-medium text-rose-700">{errorMessage}</p> : null}

              <div className="mt-5 grid gap-4">
                {filteredUsers.map((user) => {
                  const isBusy = Boolean(busyMap[user.id]);
                  return (
                    <article
                      key={user.id}
                      className="rounded-[24px] border border-stone-900/8 bg-[#f8f6f2] p-4 sm:p-5"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-1">
                          <p className="text-lg font-semibold text-stone-950">{user.full_name || user.username}</p>
                          <p className="text-sm text-stone-500">@{user.username}</p>
                          <p className="text-sm text-stone-500">{user.email || "No email"}</p>
                          <p className="text-sm text-stone-500">{user.phone_number || "No phone number"}</p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[540px]">
                          <label className="space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Role</span>
                            <select
                              value={user.role}
                              onChange={(event) => handleRoleChange(user.id, event.target.value)}
                              disabled={isBusy}
                              className="flex h-12 w-full rounded-[18px] border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-stone-950"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          </label>

                          <label className="space-y-2 sm:col-span-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                              Admin override code
                            </span>
                            <div className="flex flex-col gap-3 sm:flex-row">
                              <Input
                                type="password"
                                value={overrideDrafts[user.id] || ""}
                                onChange={(event) =>
                                  setOverrideDrafts((current) => ({ ...current, [user.id]: event.target.value }))
                                }
                                placeholder={user.role === "admin" ? "Set or clear override code" : "Available for admin only"}
                                disabled={isBusy || user.role !== "admin"}
                              />
                              <Button onClick={() => handleOverrideUpdate(user.id)} disabled={isBusy || user.role !== "admin"}>
                                Save code
                              </Button>
                            </div>
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
                          onClick={() => handleDelete(user.id)}
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
