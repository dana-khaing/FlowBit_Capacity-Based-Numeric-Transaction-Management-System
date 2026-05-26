import { AuthShell } from "./auth-shell";
import { LoginHelpFormCard } from "./login-help-form-card";

export function LoginHelpPage() {
  return (
    <AuthShell>
      <LoginHelpFormCard />
    </AuthShell>
  );
}
