const priorityLedgers = [
  {
    name: "Primary Ledger",
    priority: "P1",
    capacity: "82%",
    status: "Stable",
    detail: "Main daily allocation lane for active identifiers.",
  },
  {
    name: "Reserve Overflow",
    priority: "P2",
    capacity: "56%",
    status: "Watch",
    detail: "Extra identifier-specific capacity recovered from approved CSO.",
  },
  {
    name: "Archive Catch-Up",
    priority: "P3",
    capacity: "34%",
    status: "Low",
    detail: "Handles slower archive-side reallocation and refunds.",
  },
];

const alertQueue = [
  {
    title: "3 pending TCSO approvals",
    detail: "Identifier 101, 223, and 402 are waiting for collaborator confirmation.",
    tone: "critical",
  },
  {
    title: "Period closes in 28 minutes",
    detail: "Run pre-close notifications and clear unresolved spill over records.",
    tone: "warning",
  },
  {
    title: "2 refunds need override code",
    detail: "Refund requests are paused until an admin override code is supplied.",
    tone: "info",
  },
];

const activityFeed = [
  "Current period summary refreshed with active ledger counts and overflow totals.",
  "Collaborator exports are available in CSV and PDF per selected contact.",
  "Supabase database is connected and migrations are applied successfully.",
  "API docs are visible in development and restricted to admins in production.",
];

const dashboardCards = [
  { label: "Open Period", value: "April 2026", meta: "1 active period only" },
  { label: "Pending Overflow", value: "12", meta: "Needs collaborator action" },
  { label: "Refund Queue", value: "4", meta: "Override-protected actions" },
  { label: "Collaborators", value: "18", meta: "Private contact records" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,124,0,0.2),_transparent_28%),linear-gradient(180deg,_#f6f1e7_0%,_#efe5d4_44%,_#e8dcc7_100%)] text-stone-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-5 rounded-[32px] border border-stone-900/10 bg-white/70 p-6 shadow-[0_18px_45px_rgba(79,53,22,0.08)] backdrop-blur xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-700/20 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-900">
              FlowBit Operations
            </div>
            <div className="space-y-2">
              <h1 className="max-w-3xl font-serif text-4xl leading-tight tracking-tight text-stone-950 sm:text-5xl">
                Capacity control for periods, ledgers, refunds, and collaborator-backed spill over.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-stone-700 sm:text-base">
                This dashboard is the frontend command bridge for the FlowBit backend. It should give operators one clear place
                to watch priority-ledger pressure, pre-close risk, collaborator approvals, and admin-protected refunds.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[360px]">
            {dashboardCards.map((card) => (
              <section
                key={card.label}
                className="rounded-[24px] border border-stone-900/10 bg-stone-950 px-4 py-4 text-stone-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                <p className="text-[11px] uppercase tracking-[0.2em] text-stone-400">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold">{card.value}</p>
                <p className="mt-1 text-sm text-stone-300">{card.meta}</p>
              </section>
            ))}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-6">
            <article className="overflow-hidden rounded-[32px] border border-stone-900/10 bg-[#23150d] text-stone-50 shadow-[0_24px_70px_rgba(54,30,8,0.22)]">
              <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-amber-300/80">Live Allocation Control</p>
                    <h2 className="mt-3 text-3xl font-semibold leading-tight">
                      Build the operator dashboard around real-time ledger pressure, not static admin tables.
                    </h2>
                  </div>
                  <p className="max-w-xl text-sm leading-7 text-stone-300">
                    The backend already exposes allocation preview, collaborator contacts, audit logs, overflow resolution,
                    and report endpoints. The dashboard should surface those flows directly instead of making users jump across
                    disconnected forms.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button className="rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-300">
                      Open Allocation Preview
                    </button>
                    <button className="rounded-full border border-stone-50/20 px-5 py-3 text-sm font-semibold text-stone-50 transition hover:border-stone-50/40 hover:bg-white/5">
                      Review Pending TCSO
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Current Period</p>
                      <h3 className="mt-2 text-xl font-semibold">April 2026 Capacity Window</h3>
                    </div>
                    <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                      Open
                    </div>
                  </div>

                  <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/5 p-4">
                      <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">Overflow Exposure</dt>
                      <dd className="mt-2 text-2xl font-semibold">125.00</dd>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4">
                      <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">Reserve Capacity</dt>
                      <dd className="mt-2 text-2xl font-semibold">55.00</dd>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4">
                      <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">Collaborator Queue</dt>
                      <dd className="mt-2 text-2xl font-semibold">3 waiting</dd>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4">
                      <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">Admin Overrides</dt>
                      <dd className="mt-2 text-2xl font-semibold">2 required</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </article>

            <article className="rounded-[32px] border border-stone-900/10 bg-white/75 p-6 shadow-[0_18px_50px_rgba(71,48,19,0.08)] backdrop-blur sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Priority Lanes</p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-950">Ledger Watchlist</h2>
                </div>
                <p className="max-w-xl text-sm leading-6 text-stone-600">
                  Operators need immediate visibility into which ledger absorbs first, which reserve lane is active,
                  and which close-time capacities are close to saturation.
                </p>
              </div>

              <div className="mt-6 grid gap-4">
                {priorityLedgers.map((ledger) => (
                  <section
                    key={ledger.name}
                    className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-stone-50 p-5 lg:grid-cols-[0.8fr_1.4fr_0.6fr]"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-stone-500">{ledger.priority}</p>
                      <h3 className="mt-2 text-lg font-semibold text-stone-950">{ledger.name}</h3>
                    </div>
                    <p className="text-sm leading-6 text-stone-600">{ledger.detail}</p>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Used</p>
                        <p className="mt-1 text-xl font-semibold text-stone-950">{ledger.capacity}</p>
                      </div>
                      <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                        {ledger.status}
                      </span>
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </div>

          <aside className="space-y-6">
            <article className="rounded-[32px] border border-stone-900/10 bg-white/75 p-6 shadow-[0_18px_50px_rgba(71,48,19,0.08)] backdrop-blur sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Risk Queue</p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-950">Operator Alerts</h2>
                </div>
                <div className="rounded-full bg-stone-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-50">
                  Live
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {alertQueue.map((alert) => (
                  <section
                    key={alert.title}
                    className={`rounded-[24px] border p-4 ${
                      alert.tone === "critical"
                        ? "border-red-300 bg-red-50"
                        : alert.tone === "warning"
                          ? "border-amber-300 bg-amber-50"
                          : "border-sky-300 bg-sky-50"
                    }`}
                  >
                    <h3 className="text-sm font-semibold text-stone-950">{alert.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-stone-700">{alert.detail}</p>
                  </section>
                ))}
              </div>
            </article>

            <article className="rounded-[32px] border border-stone-900/10 bg-[#fff8ee] p-6 shadow-[0_18px_50px_rgba(71,48,19,0.08)]">
              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Activity Thread</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">Implementation Priorities</h2>

              <ol className="mt-6 space-y-4">
                {activityFeed.map((item, index) => (
                  <li key={item} className="flex gap-4">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-950 text-sm font-semibold text-white">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-7 text-stone-700">{item}</p>
                  </li>
                ))}
              </ol>
            </article>

            <article className="rounded-[32px] border border-stone-900/10 bg-stone-950 p-6 text-stone-50 shadow-[0_24px_70px_rgba(54,30,8,0.22)]">
              <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Next Build Slices</p>
              <h2 className="mt-2 text-2xl font-semibold">Frontend roadmap from this dashboard</h2>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-stone-300">
                <li>Auth shell with token storage and role-aware navigation.</li>
                <li>Period and ledger management screens with close-time controls.</li>
                <li>Ticket and transaction entry with allocation preview drawer.</li>
                <li>Overflow approval board with collaborator contact selection.</li>
                <li>Reports and audit viewer for admin users.</li>
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
