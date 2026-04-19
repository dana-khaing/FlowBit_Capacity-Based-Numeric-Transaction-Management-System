import { AuthMarketingPanel } from "./auth-marketing-panel";
import { LoginFormCard } from "./login-form-card";

export function LoginPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.86),_transparent_36%),linear-gradient(180deg,_#f8f3ea_0%,_#f1e5d3_100%)] text-stone-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:gap-10 lg:px-8 lg:py-10">
        <AuthMarketingPanel />
        <LoginFormCard />
      </div>
    </main>
  );
}
