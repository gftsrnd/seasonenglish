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
  demoLogin(): Promise<SessionView>;
}

export interface EntryScreenProps {
  client: AuthClient;
  onAuthenticated(session: SessionView): void;
}

export function EntryScreen({ client, onAuthenticated }: EntryScreenProps) {
  const [audience, setAudience] = useState<"learner" | "staff">("learner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await (audience === "learner"
        ? client.learnerLogin({ email, password })
        : client.staffLogin({ email, password }));
      onAuthenticated(session);
    } catch {
      setError("Không thể đăng nhập. Vui lòng kiểm tra thông tin và thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const startDemo = async () => {
    setBusy(true);
    setError("");
    try {
      onAuthenticated(await client.demoLogin());
    } catch {
      setError("Bản dùng thử hiện chưa sẵn sàng. Vui lòng thử lại sau.");
    } finally {
      setBusy(false);
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
            {audience === "learner" ? "Đăng nhập người học" : "Đăng nhập nhân sự"}
          </button>
        </form>

        <div className="entry-demo">
          <span aria-hidden="true" />
          <p>Muốn xem trước trải nghiệm?</p>
          <span aria-hidden="true" />
        </div>
        <button type="button" onClick={startDemo} disabled={busy}>Dùng thử</button>
      </section>
    </main>
  );
}
