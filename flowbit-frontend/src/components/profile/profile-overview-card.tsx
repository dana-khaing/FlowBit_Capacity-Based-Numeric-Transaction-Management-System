import { type AuthUser } from "@/lib/auth-client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";

type ProfileOverviewCardProps = {
  user: AuthUser;
};

export function ProfileOverviewCard({ user }: ProfileOverviewCardProps) {
  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white px-5 py-6 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-8 sm:py-8">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-stretch xl:justify-between">
        <div className="rounded-[24px] bg-[#f8f6f2] p-5 sm:p-6 xl:flex-1">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ProfileAvatar user={user} className="h-24 w-24 rounded-[30px]" textClassName="text-3xl font-semibold" />
            <div className="min-w-0">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-400">User Profile</p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-4">
                <h1 className="min-w-0 break-words text-4xl font-semibold text-stone-950">{user.full_name || user.username}</h1>
                <span className="inline-flex w-fit items-center rounded-full bg-stone-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                  {user.role || "User"}
                </span>
              </div>
              <p className="mt-2 text-base text-stone-500">@{user.username}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:w-[440px] xl:grid-cols-1">
          <div className="rounded-[22px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_4px_18px_rgba(28,24,20,0.04)]">
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Contact Email</p>
            <p className="mt-3 break-words text-sm font-medium text-stone-900">{user.email || "Not provided"}</p>
          </div>
          <div className="rounded-[22px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_4px_18px_rgba(28,24,20,0.04)]">
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Phone Number</p>
            <p className="mt-3 text-sm font-medium text-stone-900">{user.phone_number || "Not provided"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
