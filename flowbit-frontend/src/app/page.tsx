const metrics = [
  { label: "Open Period", value: "April 2026", meta: "1 active period" },
  { label: "Pending TCSO", value: "12", meta: "3 urgent approvals" },
  { label: "Refund Queue", value: "4", meta: "Override required" },
  { label: "Collaborators", value: "18", meta: "Private contacts" },
];

const navItems = ["Dashboard", "Tickets", "Overflow", "Ledgers", "Reports", "Audit"];

const quickActions = [
  "Create ticket",
  "Preview allocation",
  "Approve TCSO",
  "Open reports",
];

const workflowCards = [
  {
    title: "Ticket Entry",
    detail: "Create tickets, add transactions, and check identifier capacity before anything becomes overflow.",
  },
  {
    title: "Overflow Review",
    detail: "Move TCSO to CSO with a selected collaborator and keep approval timing visible.",
  },
  {
    title: "Period Control",
    detail: "Track close-time risk, refunds, reserve capacity, and override-protected actions in one place.",
  },
];

const liveItems = [
  {
    identifier: "223",
    title: "Collaborator approval needed",
    detail: "Close time is approaching. A collaborator must be selected before approval.",
    amount: "34.40",
    tone: "critical",
  },
  {
    identifier: "234",
    title: "Refund waiting for override",
    detail: "This ticket refund is paused until a valid admin override code is provided.",
    amount: "35.00",
    tone: "warning",
  },
  {
    identifier: "402",
    title: "Reserve capacity available",
    detail: "Identifier-specific helper capacity is ready to absorb the next overflow first.",
    amount: "18.60",
    tone: "calm",
  },
];

const ledgerItems = [
  {
    name: "Primary Ledger",
    priority: "P1",
    used: "82%",
    free: "180.00",
  },
  {
    name: "Reserve Overflow",
    priority: "P2",
    used: "56%",
    free: "55.00",
  },
  {
    name: "Archive Catch-Up",
    priority: "P3",
    used: "34%",
    free: "420.00",
  },
];

const highlights = [
  "Manual allocation preview already exists in the backend and should become a first-class UI flow.",
  "Collaborator exports support CSV and PDF, sorted by identifier or approval time.",
  "Supabase is live, migrations are done, and the dashboard can now be wired to real data.",
];

function toneClass(tone: string) {
  if (tone === "critical") return "border-red-200 bg-red-50";
  if (tone === "warning") return "border-amber-200 bg-amber-50";
  return "border-emerald-200 bg-emerald-50";
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.85),_transparent_35%),linear-gradient(180deg,_#f8f3ea_0%,_#f1e5d3_100%)] text-stone-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="rounded-[30px] border border-stone-900/10 bg-white/78 p-4 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-stone-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-700">
                FlowBit Workspace
              </div>
              <h1 className="mt-4 font-serif text-3xl leading-tight text-stone-950 sm:text-4xl">
                A cleaner operations app for tickets, ledgers, overflow review, and reporting.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600 sm:text-[15px]">
                This dashboard should feel like a modern app, not a control-room console. Desktop gets room to breathe,
                tablet stays structured, and mobile keeps the same actions without compressing everything into dense panels.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
              {metrics.map((metric) => (
                <section key={metric.label} className="rounded-[22px] border border-stone-900/10 bg-stone-50 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-stone-950">{metric.value}</p>
                  <p className="mt-1 text-sm text-stone-600">{metric.meta}</p>
                </section>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {navItems.map((item, index) => (
              <button
                key={item}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
                  index === 0
                    ? "bg-stone-950 text-white"
                    : "border border-stone-900/10 bg-white text-stone-700"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </header>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.92fr)]">
          <div className="space-y-5">
            <article className="rounded-[30px] border border-stone-900/10 bg-[#1f1712] p-5 text-stone-50 shadow-[0_20px_60px_rgba(54,30,8,0.18)] sm:p-6">
              <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-amber-300/80">Start Here</p>
                  <h2 className="mt-3 text-3xl font-semibold leading-tight">
                    Give operators a simple starting point, then let detail expand where it is needed.
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-300">
                    The backend already handles manual allocation preview, collaborator-backed approval, admin override
                    checks, exports, audit logs, and reports. The frontend should expose those flows clearly without forcing
                    users into a heavy multi-panel workstation all the time.
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {quickActions.map((action) => (
                      <button
                        key={action}
                        className="rounded-[20px] border border-white/10 bg-white/6 px-4 py-4 text-left text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[26px] border border-white/10 bg-white/6 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Current Period</p>
                  <h3 className="mt-2 text-xl font-semibold">April 2026 Capacity Window</h3>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <section className="rounded-[20px] bg-white/6 p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-stone-400">Overflow Exposure</p>
                      <p className="mt-2 text-2xl font-semibold">125.00</p>
                    </section>
                    <section className="rounded-[20px] bg-white/6 p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-stone-400">Reserve Capacity</p>
                      <p className="mt-2 text-2xl font-semibold">55.00</p>
                    </section>
                    <section className="rounded-[20px] bg-white/6 p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-stone-400">Collaborator Queue</p>
                      <p className="mt-2 text-2xl font-semibold">3 waiting</p>
                    </section>
                    <section className="rounded-[20px] bg-white/6 p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-stone-400">Admin Overrides</p>
                      <p className="mt-2 text-2xl font-semibold">2 required</p>
                    </section>
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-[30px] border border-stone-900/10 bg-white/78 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Core Flows</p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-950">App structure, not command center</h2>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-stone-600">
                  Each main task should become a focused screen or drawer. The dashboard stays as orientation, not as the
                  only place users can do everything.
                </p>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {workflowCards.map((card) => (
                  <section key={card.title} className="rounded-[24px] border border-stone-900/10 bg-stone-50 p-5">
                    <h3 className="text-xl font-semibold text-stone-950">{card.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-stone-600">{card.detail}</p>
                  </section>
                ))}
              </div>
            </article>

            <article className="rounded-[30px] border border-stone-900/10 bg-white/78 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Ledger Snapshot</p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-950">Priority still matters, but the view stays calm</h2>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-stone-600">
                  Operators still need to understand auto-allocation order and free capacity, but the presentation can be
                  cleaner and easier to scan.
                </p>
              </div>

              <div className="mt-6 grid gap-4">
                {ledgerItems.map((ledger) => (
                  <section
                    key={ledger.name}
                    className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-stone-50 p-5 md:grid-cols-[0.8fr_1fr_0.8fr]"
                  >
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{ledger.priority}</p>
                      <h3 className="mt-2 text-lg font-semibold text-stone-950">{ledger.name}</h3>
                    </div>
                    <div className="rounded-[20px] bg-white px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Used</p>
                      <p className="mt-2 text-xl font-semibold text-stone-950">{ledger.used}</p>
                    </div>
                    <div className="rounded-[20px] bg-white px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Free Capacity</p>
                      <p className="mt-2 text-xl font-semibold text-stone-950">{ledger.free}</p>
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </div>

          <aside className="space-y-5">
            <article className="rounded-[30px] border border-stone-900/10 bg-white/78 p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] backdrop-blur sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Live Queue</p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-950">What needs attention now</h2>
                </div>
                <span className="rounded-full bg-stone-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                  Live
                </span>
              </div>

              <div className="mt-6 space-y-4">
                {liveItems.map((item) => (
                  <section key={item.identifier} className={`rounded-[24px] border p-4 ${toneClass(item.tone)}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Identifier {item.identifier}</p>
                        <h3 className="mt-2 text-sm font-semibold text-stone-950">{item.title}</h3>
                      </div>
                      <p className="text-lg font-semibold text-stone-950">{item.amount}</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-stone-700">{item.detail}</p>
                  </section>
                ))}
              </div>
            </article>

            <article className="rounded-[30px] border border-stone-900/10 bg-[#fff8ee] p-5 shadow-[0_18px_50px_rgba(73,52,26,0.08)] sm:p-6">
              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Highlights</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">Backend features already ready to wire</h2>
              <ol className="mt-6 space-y-4">
                {highlights.map((item, index) => (
                  <li key={item} className="flex gap-4">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-sm font-semibold text-white">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-7 text-stone-700">{item}</p>
                  </li>
                ))}
              </ol>
            </article>

            <article className="rounded-[30px] border border-stone-900/10 bg-stone-950 p-5 text-stone-50 shadow-[0_20px_60px_rgba(54,30,8,0.18)] sm:p-6">
              <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Next Build Slices</p>
              <h2 className="mt-2 text-2xl font-semibold">Move from shell to product</h2>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-stone-300">
                <li>Auth and session handling.</li>
                <li>Ticket and transaction workflow screens.</li>
                <li>Overflow review with collaborator selection.</li>
                <li>Report and audit pages connected to live APIs.</li>
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
