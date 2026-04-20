"use client";

import { useEffect, useState } from "react";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { ProfileDetailsCard } from "@/components/profile/profile-details-card";
import { ProfileOverviewCard } from "@/components/profile/profile-overview-card";
import { ProfileSecurityCard } from "@/components/profile/profile-security-card";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";

export function ProfilePage() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());

  useEffect(() => {
    fetchCurrentUser().then(setUser).catch(() => {
      // SessionGuard handles invalid sessions.
    });
  }, []);

  if (!user) {
    return (
      <WorkspaceShell>
        <div className="mx-auto w-full max-w-[1800px] px-4 py-8 text-sm text-stone-500 sm:px-6 lg:px-8">
          Loading your profile...
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
        <ProfileOverviewCard user={user} />

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <ProfileDetailsCard user={user} onUserChange={setUser} />
          <ProfileSecurityCard />
        </div>
      </div>
    </WorkspaceShell>
  );
}
