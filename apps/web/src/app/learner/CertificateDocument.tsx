import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import type { RewardView } from "@e4s/contracts";
import "../shared/reward-presentation.css";
import { InfoTip } from "../shared/CompactUi.js";
import { RewardBadgeArtwork } from "../shared/RewardBadgeArtwork.js";

export function CertificateActions({ children }: { children: ReactNode }) {
  return <div className="row no-print reward-actions">{children}</div>;
}

const rewardPrintStyleId = "e4s-reward-print-style";

export function printCertificateLayout() {
  if (typeof document === "undefined") return;
  document.getElementById(rewardPrintStyleId)?.remove();
  const style = document.createElement("style");
  style.id = rewardPrintStyleId;
  style.textContent = "@media print { @page { size: A4 landscape; margin: 10mm; } .reward-page .cert-doc { break-inside: avoid; } }";
  document.head.appendChild(style);
  const cleanup = () => { style.remove(); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup, { once: true });
  try { window.print(); } catch (error) { cleanup(); throw error; }
}

interface CertificateDocumentProps {
  organizationName: string;
  certificateNumber?: string | undefined;
  learnerName: string;
  title: string;
  declaration: ReactNode;
  children: ReactNode;
  signature?: ReactNode;
  preview?: boolean;
  previewInfo?: string | undefined;
  /** Short facts for the phone summary card (date, level, badges…), shown instead of the full certificate there. */
  summary?: ReadonlyArray<{ label: string; value: ReactNode }>;
  summaryDetails?: ReactNode;
}

export function CertificateDocument({ organizationName, certificateNumber, learnerName, title, declaration, children, signature, preview, previewInfo, summary, summaryDetails }: CertificateDocumentProps) {
  const number = preview ? undefined : certificateNumber;
  const previewBadge = preview ? <span className="cert-preview-badge">Bản xem trước</span> : null;
  const certificate = <section className="cert-doc" aria-label={title}>
    <header className="cert-head">
      <div className="row cert-brand">
        <img className="cert-logo" src="/gft-logo.png" alt={organizationName} />
        <div><div className="cert-org">Season English</div><div className="xs muted">{organizationName} · Chương trình tiếng Anh nội bộ</div></div>
      </div>
      {preview ? <div className="cert-no cert-preview-marker xs muted">Bản xem trước</div>
        : number && <div className="cert-no xs muted">Số: <span>{number}</span></div>}
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
    <div className="cert-foot xs muted">{preview
      ? "Chứng nhận tự động từ dữ liệu Season English, có giá trị nội bộ khi được cấp. BẢN XEM TRƯỚC"
      : "Chứng nhận tự động từ dữ liệu Season English, có giá trị nội bộ."}</div>
  </section>;
  return <>
  <div className="cert-stage">{certificate}</div>
  <div className="cert-paper-layout cert-print-only" hidden>{certificate}</div>
  <section className="card cert-summary no-print" aria-label={`Tóm tắt ${title}`}>
    {preview && <div className="cert-preview-summary-head">
      <img src="/gft-logo.png" alt="" width={32} height={32} />
      {previewBadge}
    </div>}
    <h2 className="eyebrow cert-summary-title" aria-label={`Tóm tắt: ${title}`}>{title}<InfoTip label="Về bản tóm tắt" text={preview
      ? previewInfo ?? "Bản xem trước dùng dữ liệu giả lập."
      : "Mở bản in để xem bản chứng nhận trên trang A4 ngang."} /></h2>
    <div className="cert-summary-name">{learnerName}</div>
    <p className="small cert-summary-line">{declaration}</p>
    <dl className={preview ? "cert-summary-facts cert-summary-facts--preview" : "cert-summary-facts"}>
      {(summary ?? []).map(fact => <div key={fact.label}><dt className="xs muted">{fact.label}</dt><dd>{fact.value}</dd></div>)}
      {number && <div className="cert-summary-identifier"><dt className="xs muted">Số chứng nhận</dt><dd className="cert-summary-number">{number}</dd></div>}
    </dl>
    {summaryDetails}
    <button className="btn" type="button" onClick={printCertificateLayout}>Xem bản in / PDF</button>
  </section>
  </>;
}

type BadgeCertificateView = Pick<RewardView, "organizationName" | "certificateNumber" | "learnerName" | "requiredBadgeCount" |
  "displayPoints" | "season" | "completedAt" | "operatorName" | "managerName" | "badges"> & { cefrLabel?: string };

/**
 * The badge certificate template (reward/preview, reward/done). The course certificate (reward/course) reuses it
 * with `course`: its own title, declaration, number and issue date, and the same badge list.
 */
export function BadgeCertificate({ view, preview, previewInfo, course }: { view: BadgeCertificateView; preview: boolean; previewInfo?: string; course?: { title: string; declaration: ReactNode; issuedAt: string; certificateNumber: string; learnerName: string } }) {
  const earnedCount = view.badges.filter((badge) => badge.earned).length;
  const issued = course?.issuedAt ?? (!preview ? view.completedAt : null);
  const date = issued ? new Date(issued).toLocaleDateString("vi-VN") : "Chưa cấp";
  const seasonText = view.season.cefr ? `${view.season.name} · ${view.season.cefr}` : view.season.name;
  const badgeCount = `${earnedCount}/${view.requiredBadgeCount}`;
  const facts = [
    { label: "Ngày cấp", value: date },
    { label: "Huy hiệu", value: badgeCount },
    { label: "Điểm", value: view.displayPoints },
    { label: "Season", value: seasonText }
  ];
  const achievement = earnedCount === view.requiredBadgeCount
    ? `đã hoàn thành bộ ${view.requiredBadgeCount} huy hiệu`
    : `đã đạt ${badgeCount} huy hiệu`;
  return <CertificateDocument organizationName={view.organizationName} certificateNumber={course?.certificateNumber ?? view.certificateNumber} learnerName={course?.learnerName ?? view.learnerName}
    title={course?.title ?? "Certificate of Completion"} preview={preview} previewInfo={previewInfo}
    summary={facts}
    summaryDetails={<CertificateBadgeList badges={view.badges} showArtwork />}
    declaration={course?.declaration ?? <>{achievement} Season English{view.cefrLabel && <> ở trình độ <b>{view.cefrLabel}</b></>}.</>}
    signature={<div className="cert-sign">
      <div><div className="line" /><div className="small">Vận hành</div><div className="xs muted">{view.operatorName}</div></div>
      <div className="cert-date xs muted">{view.organizationName}, {date}</div>
      <div><div className="line" /><div className="small">Quản lý</div><div className="xs muted">{view.managerName}</div></div>
    </div>}>
    <div className="cert-facts">
      {facts.map(fact => <div key={fact.label}><span className="xs muted">{fact.label}</span><b>{fact.value}</b></div>)}
    </div>
    <CertificateBadgeList badges={view.badges} />
  </CertificateDocument>;
}

function CertificateBadgeList({ badges, showArtwork = false }: { badges: RewardView["badges"]; showArtwork?: boolean }) {
  return <ul className="cert-badges badge-certificate-list" aria-label="Trạng thái huy hiệu">
    {badges.map(badge => {
      const status = badge.earned ? "Đã đạt" : "Chưa đạt";
      return <li className="cert-badge" key={badge.key}>
        {showArtwork
          ? <span className={badge.earned ? "cert-badge-art cert-badge-art--earned" : "cert-badge-art"}>
            <RewardBadgeArtwork badgeKey={badge.key} label={badge.label} />
            <span className="cert-badge-state" aria-label={status} role="img">
              {badge.earned ? "✓" : <LockKeyhole size={9} aria-hidden="true" />}
            </span>
          </span>
          : <span className={badge.earned ? "ck" : "ck cert-badge-unearned"} role="img" aria-label={status}>
            {badge.earned ? "✓" : "○"}
          </span>}
        <b>{badge.label}</b>
      </li>;
    })}
  </ul>;
}
