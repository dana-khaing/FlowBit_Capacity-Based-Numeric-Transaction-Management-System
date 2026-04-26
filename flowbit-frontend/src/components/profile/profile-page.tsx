"use client";

import { useEffect, useState } from "react";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { ProfileAvatarCard } from "@/components/profile/profile-avatar-card";
import { ProfileAdminActionsCard } from "@/components/profile/profile-admin-actions-card";
import { ProfileDangerZoneCard } from "@/components/profile/profile-danger-zone-card";
import { ProfileDetailsCard } from "@/components/profile/profile-details-card";
import { ProfileOverviewCard } from "@/components/profile/profile-overview-card";
import { ProfilePasswordCard } from "@/components/profile/profile-password-card";
import { ProfileSessionCard } from "@/components/profile/profile-session-card";
import { ProfileToast } from "@/components/profile/profile-toast";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";

export function ProfilePage() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    fetchCurrentUser().then(setUser).catch(() => {
      // SessionGuard handles invalid sessions.
    });
  }, []);

  if (!user) {
    return (
      <WorkspaceShell>
        <div className="mx-auto w-full max-w-[1800px] px-4 py-4 text-sm text-stone-500 sm:px-6 lg:px-8">
          Loading your profile...
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell>
      {toastMessage ? <ProfileToast message={toastMessage} onClose={() => setToastMessage("")} /> : null}
      <div className="mx-auto w-full max-w-[1800px] px-4 py-2 sm:px-6 lg:px-8 lg:py-5">
        <ProfileOverviewCard user={user} />

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <div className="space-y-5">
            <ProfileAvatarCard user={user} onUserChange={setUser} onNotify={setToastMessage} />
            <ProfileDetailsCard user={user} onUserChange={setUser} onNotify={setToastMessage} />
          </div>
          <div className="space-y-5">
            <ProfilePasswordCard onNotify={setToastMessage} />
            <ProfileSessionCard user={user} />
            <ProfileAdminActionsCard user={user} />
            <ProfileDangerZoneCard user={user} />
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
