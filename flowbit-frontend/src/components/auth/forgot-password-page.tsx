import { AuthShell } from "./auth-shell";
import { ForgotPasswordFormCard } from "./forgot-password-form-card";

export function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordFormCard />
    </AuthShell>
  );
}
