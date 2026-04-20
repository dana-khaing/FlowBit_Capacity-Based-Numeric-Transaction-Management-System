import Link from "next/link";

type AdminPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actionHref = "/profile",
  actionLabel = "Back to profile",
}: AdminPageHeaderProps) {
  return (
    <div className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-950">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">{description}</p>
        </div>
        <Link
          href={actionHref}
          className="inline-flex rounded-[18px] border border-stone-900/10 bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
