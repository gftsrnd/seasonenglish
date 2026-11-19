import type { ReactNode } from "react";
import { Compass, Home, ArrowLeft } from "lucide-react";
import { SeasonMark } from "./SeasonMark.js";
import "./status-page.css";

/**
 * In-app error state (owner 19/11: "trang lỗi chuyên nghiệp và đẹp hơn"): a centred card with the
 * Season mark, an error code, a clear title and next step, and two actions – back to home and back.
 */
export function NotFoundState({ title = "Không tìm thấy trang", message, code = "404" as string | null, home }: {
  title?: string;
  message?: ReactNode;
  /** null hides the code line (content that is not ready yet rather than a wrong address). */
  code?: string | null;
  /** The home action, rendered by the caller (router link or button). */
  home: ReactNode;
}) {
  return <section className="status-state" role="alert" aria-labelledby="status-state-title">
    <div className="status-state__art" aria-hidden="true">
      <SeasonMark className="status-state__mark" />
      <span className="status-state__badge"><Compass size={22} strokeWidth={2} /></span>
    </div>
    {code ? <p className="status-state__code">Lỗi {code}</p> : null}
    <h1 id="status-state-title">{title}</h1>
    <p className="status-state__message">{message ?? "Đường dẫn có thể đã thay đổi hoặc trang này không còn nữa. Bạn hãy quay về trang chủ để tiếp tục học."}</p>
    <div className="status-state__actions">
      {home}
      <button type="button" className="btn" onClick={() => window.history.back()}><ArrowLeft size={16} aria-hidden="true" />Quay lại</button>
    </div>
  </section>;
}

export function StatusHomeIcon() { return <Home size={16} aria-hidden="true" />; }
