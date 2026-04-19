import Link from "next/link";

const authHighlights = [
  "Username/password login for daily operations",
  "Google sign-in ready for frontend integration",
  "Admin override and audit-protected backend flows",
];

const envChecks = [
  { label: "API", value: "Backend ready" },
  { label: "Auth", value: "Token endpoints live" },
  { label: "DB", value: "Supabase connected" },
];

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.86),_transparent_36%),linear-gradient(180deg,_#f8f3ea_0%,_#f1e5d3_100%)] text-stone-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:gap-10 lg:px-8 lg:py-10">
        <section className="rounded-[32px] border border-stone-900/8 bg-[#1f1712] p-6 text-stone-50 shadow-[0_20px_60px_rgba(54,30,8,0.18)] sm:p-8 lg:w-[46%]">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">
            FlowBit Workspace
          </div>
          <h1 className="mt-5 font-serif text-4xl leading-tight text-white sm:text-5xl">
            Sign in to manage periods, ledgers, overflow approvals, and reports.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-stone-300 sm:text-[15px]">
            This screen should feel calm and direct. Operators can sign in with their FlowBit account now, and the same
            entry point can later attach the Google flow without changing the layout.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {envChecks.map((item) => (
              <div key={item.label} className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">{item.label}</p>
                <p className="mt-2 text-lg font-medium text-white">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-[26px] border border-white/10 bg-white/6 p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-stone-400">Included in backend</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-300">
              {authHighlights.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-5 rounded-[32px] border border-stone-900/8 bg-white/82 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-8 lg:mt-0 lg:w-[54%]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-stone-500">Sign In</p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-950">Welcome back</h2>
            </div>
            <Link
              href="/"
              className="rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-600"
            >
              Back to dashboard
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-stone-600">Username</span>
              <input
                type="text"
                placeholder="LewisGod"
                className="mt-2 w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-950"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-stone-600">Password</span>
              <input
                type="password"
                placeholder="Enter your password"
                className="mt-2 w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-950"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-3 text-sm text-stone-500">
              <input type="checkbox" className="h-4 w-4 rounded border-stone-300" />
              Keep me signed in on this device
            </label>

            <Link href="#" className="text-sm font-medium text-[#b66427]">
              Forgot password?
            </Link>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button className="flex-1 rounded-[20px] bg-stone-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-stone-800">
              Sign in to FlowBit
            </button>
            <button className="flex-1 rounded-[20px] border border-stone-900/10 bg-white px-5 py-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50">
              Continue with Google
            </button>
          </div>

          <div className="mt-8 rounded-[24px] border border-stone-900/8 bg-[#f5f1ea] p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Access Notes</p>
                <h3 className="mt-2 text-lg font-semibold text-stone-950">Role-aware sign-in behavior</h3>
              </div>
              <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600">Admin + User</div>
            </div>

            <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
              <li>Regular users can access tickets, transactions, overflow approval, reports, and collaborator flows.</li>
              <li>Admin users can also manage periods, ledgers, audit logs, and protected override actions.</li>
              <li>Google sign-in can plug into the same screen once the frontend SDK is wired.</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
