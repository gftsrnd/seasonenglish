import type { ReactNode } from "react";
import type { RewardView } from "@e4s/contracts";
import "../shared/reward-presentation.css";

export function CertificateActions({ children }: { children: ReactNode }) {
  return <div className="row no-print reward-actions">{children}</div>;
}

interface CertificateDocumentProps {
  organizationName: string;
  certificateNumber: string;
  learnerName: string;
  title: string;
  declaration: ReactNode;
  children: ReactNode;
  signature?: ReactNode;
  preview?: boolean;
  /** Short facts for the phone summary card (date, level, badges…), shown instead of the full certificate there. */
  summary?: ReadonlyArray<{ label: string; value: ReactNode }>;
}

export function CertificateDocument({ organizationName, certificateNumber, learnerName, title, declaration, children, signature, preview, summary }: CertificateDocumentProps) {
  // Phones show a readable summary card; the full certificate stays in the page for printing and for wider screens.
  return <><div className="cert-stage"><section className="cert-doc" aria-label={title}>
    <header className="cert-head">
      <div className="row cert-brand">
        <img className="cert-logo" src="/gft-logo.png" alt={organizationName} />
        <div><div className="cert-org">Season English</div><div className="xs muted">{organizationName} · Chương trình tiếng Anh nội bộ</div></div>
      </div>
      <div className="cert-no xs muted">Số: <span>{certificateNumber}</span></div>
    </header>
    <div className="cert-body">
      <div className="eyebrow cert-eyebrow">Chứng nhận hoàn thành</div>
      <h1 className="cert-title">{title}</h1>
      <p className="cert-line">Chứng nhận</p>
      <div className="cert-name">{learnerName}</div>
      <p className="cert-line">{declaration}</p>
      {children}
    </div>
    {signature}
    <div className="cert-foot xs muted">Chứng nhận tự động từ dữ liệu Season English, có giá trị nội bộ. {preview ? "BẢN XEM TRƯỚC" : ""}</div>
  </section></div>
  <section className="card cert-summary no-print" aria-label={`Tóm tắt ${title}`}>
    <div className="eyebrow">{title}</div>
    <div className="cert-summary-name">{learnerName}</div>
    <p className="small cert-summary-line">{declaration}</p>
    <dl className="cert-summary-facts">
      {(summary ?? []).map(fact => <div key={fact.label}><dt className="xs muted">{fact.label}</dt><dd>{fact.value}</dd></div>)}
      <div><dt className="xs muted">Số chứng nhận</dt><dd className="cert-summary-number">{certificateNumber}</dd></div>
    </dl>
    <p className="xs muted">Màn hình nhỏ chỉ hiện tóm tắt. Dùng nút In / lưu PDF để tải bản chứng nhận đầy đủ.</p>
  </section></>;
}

type BadgeCertificateView = Pick<RewardView, "organizationName" | "certificateNumber" | "learnerName" | "requiredBadgeCount" |
  "displayPoints" | "season" | "completedAt" | "operatorName" | "managerName" | "badges"> & { cefrLabel?: string };

export function BadgeCertificate({ view, preview }: { view: BadgeCertificateView; preview: boolean }) {
  const completedAt = new Date(view.completedAt);
  const earnedCount = preview ? view.badges.length : view.badges.filter((badge) => badge.earned).length;
  const date = completedAt.toLocaleDateString("vi-VN");
  // Every CEFR level has its own Season ladder: the certificate names the Season and its level.
  const seasonText = view.season.cefr ? `${view.season.name} · ${view.season.cefr}` : view.season.name;
  return <CertificateDocument organizationName={view.organizationName} certificateNumber={view.certificateNumber} learnerName={view.learnerName}
    title="Certificate of Completion" preview={preview}
    summary={[{ label: "Ngày cấp", value: date }, { label: "Huy hiệu", value: `${earnedCount}/${view.requiredBadgeCount}` }, { label: "Season", value: seasonText }]}
    declaration={<>đã hoàn thành bộ {view.requiredBadgeCount} huy hiệu Season English{view.cefrLabel && <> ở trình độ <b>{view.cefrLabel}</b></>}.</>}
    signature={<div className="cert-sign">
      <div><div className="line" /><div className="small">Vận hành</div><div className="xs muted">{view.operatorName}</div></div>
      <div className="cert-date xs muted">{view.organizationName}, {date}</div>
      <div><div className="line" /><div className="small">Quản lý</div><div className="xs muted">{view.managerName}</div></div>
    </div>}>
    <div className="cert-facts">
      <div><span className="xs muted">Ngày cấp</span><b>{date}</b></div>
      <div><span className="xs muted">Huy hiệu</span><b>{earnedCount}/{view.requiredBadgeCount}</b></div>
      <div><span className="xs muted">Điểm</span><b>{view.displayPoints}</b></div>
      <div><span className="xs muted">Season</span><b>{seasonText}</b></div>
    </div>
    <ul className="cert-badges badge-certificate-list">
      {view.badges.map((badge) => <li className="cert-badge" key={badge.key}>
        <span className="ck" aria-label={preview || badge.earned ? "Đã đạt" : "Chưa đạt"} role="img">{preview || badge.earned ? "✓" : "○"}</span><b>{badge.label}</b>
      </li>)}
    </ul>
  </CertificateDocument>;
}
