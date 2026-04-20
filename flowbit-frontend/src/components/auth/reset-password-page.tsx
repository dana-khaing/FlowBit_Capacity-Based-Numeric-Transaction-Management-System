import { AuthShell } from "./auth-shell";
import { ResetPasswordFormCard } from "./reset-password-form-card";

type ResetPasswordPageProps = {
  selector: string;
  token: string;
};

export function ResetPasswordPage({ selector, token }: ResetPasswordPageProps) {
  return (
    <AuthShell>
      <ResetPasswordFormCard selector={selector} token={token} />
    </AuthShell>
  );
}
