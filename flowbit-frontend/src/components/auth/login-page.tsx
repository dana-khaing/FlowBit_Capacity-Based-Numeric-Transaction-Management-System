import { AuthShell } from "./auth-shell";
import { LoginFormCard } from "./login-form-card";

export function LoginPage() {
  return (
    <AuthShell>
        <LoginFormCard />
    </AuthShell>
  );
}
