import { type AuthUser } from "@/lib/auth-client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";

type ProfileOverviewCardProps = {
  user: AuthUser;
};

export function ProfileOverviewCard({ user }: ProfileOverviewCardProps) {
  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white px-5 py-6 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-8 sm:py-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          <ProfileAvatar user={user} />
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-400">User Profile</p>
            <h1 className="mt-2 text-4xl font-semibold text-stone-950">{user.full_name || user.username}</h1>
            <p className="mt-2 text-base text-stone-500">@{user.username}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] border border-stone-900/8 bg-[#f5f1ea] px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Role</p>
            <p className="mt-2 text-base font-medium capitalize text-stone-900">{user.role}</p>
          </div>
          <div className="rounded-[22px] border border-stone-900/8 bg-[#f5f1ea] px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Email</p>
            <p className="mt-2 text-sm font-medium text-stone-900">{user.email || "Not provided"}</p>
          </div>
          <div className="rounded-[22px] border border-stone-900/8 bg-[#f5f1ea] px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Phone</p>
            <p className="mt-2 text-sm font-medium text-stone-900">{user.phone_number || "Not provided"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
