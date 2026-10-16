import { useState, type FormEvent } from "react";
import type { SessionView } from "@e4s/contracts";

export type { SessionView } from "@e4s/contracts";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthClient {
  learnerLogin(input: LoginCredentials): Promise<SessionView>;
  staffLogin(input: LoginCredentials): Promise<SessionView>;
}

export interface EntryScreenProps {
  client: AuthClient;
  onAuthenticated(session: SessionView): void;
}

export function EntryScreen({ client, onAuthenticated }: EntryScreenProps) {
  const [audience, setAudience] = useState<"learner" | "staff">("learner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAction, setPendingAction] = useState<"login" | null>(null);
  const [error, setError] = useState("");
  const busy = pendingAction !== null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingAction("login");
    setError("");
    try {
      const session = await (audience === "learner"
        ? client.learnerLogin({ email, password })
        : client.staffLogin({ email, password }));
      onAuthenticated(session);
    } catch {
      setError("Không thể đăng nhập. Vui lòng kiểm tra email và mật khẩu.");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <main className="entry-shell">
      <section className="entry-intro" aria-labelledby="entry-title">
        <p className="entry-eyebrow">E4S · English for Every Season</p>
        <h1 id="entry-title">Học tiếng Anh cho công việc</h1>
        <p>Học ngắn mỗi ngày, luyện tình huống thực tế và nhận phản hồi để làm tốt hơn ở lần tiếp theo.</p>
      </section>

      <section className="entry-panel" aria-label="Đăng nhập E4S">
        <div className="entry-audience">
          <h2>{audience === "learner" ? "Chào mừng bạn quay lại" : "Đăng nhập dành cho nhân sự"}</h2>
          <button
            type="button"
            className="entry-switch"
            disabled={busy}
            onClick={() => setAudience((value) => value === "learner" ? "staff" : "learner")}
            aria-pressed={audience === "staff"}
          >
            {audience === "learner" ? "Dành cho nhân sự" : "Quay lại người học"}
          </button>
        </div>

        <form onSubmit={submit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="login-password">Mật khẩu</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error ? <p role="alert">{error}</p> : null}

          <button type="submit" disabled={busy}>
            {pendingAction === "login" ? "Đang đăng nhập…" : audience === "learner" ? "Đăng nhập người học" : "Đăng nhập nhân sự"}
          </button>
        </form>

      </section>
    </main>
  );
}
