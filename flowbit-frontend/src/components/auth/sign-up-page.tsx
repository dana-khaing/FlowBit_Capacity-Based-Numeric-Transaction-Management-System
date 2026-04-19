import { AuthShell } from "./auth-shell";
import { SignUpFormCard } from "./sign-up-form-card";

export function SignUpPage() {
  return (
    <AuthShell>
      <SignUpFormCard />
    </AuthShell>
  );
}
