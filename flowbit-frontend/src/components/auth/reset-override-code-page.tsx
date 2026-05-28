import { AuthShell } from "./auth-shell";
import { ResetOverrideCodeFormCard } from "./reset-override-code-form-card";

type ResetOverrideCodePageProps = {
  selector: string;
  token: string;
};

export function ResetOverrideCodePage({ selector, token }: ResetOverrideCodePageProps) {
  return (
    <AuthShell>
      <ResetOverrideCodeFormCard selector={selector} token={token} />
    </AuthShell>
  );
}
