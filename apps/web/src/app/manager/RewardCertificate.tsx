import { Link, useSearchParams } from "react-router";
import { BadgeCertificate, CertificateActions } from "../learner/CertificateDocument.js";
import type { CefrLevel } from "@e4s/contracts";
import { rewardBadgeCatalogAt } from "./reward-catalog.js";

const CEFR_LEVELS: readonly string[] = ["A1", "A2", "B1", "B2", "C1"];

export function ManagerRewardCertificate() {
  const [params] = useSearchParams();
  const points = Number(params.get("points"));
  const displayPoints = Number.isInteger(points) && points >= 5000 && points <= 6000 ? points : 5600;
  const level = (CEFR_LEVELS.includes(params.get("level") ?? "") ? params.get("level") : "C1") as CefrLevel;
  const rewardBadgeCatalog = rewardBadgeCatalogAt(level);
  const view = {
    organizationName: "GFT Demo",
    certificateNumber: "SE-PREVIEW",
    learnerName: "Học viên mẫu",
    completedAt: new Date().toISOString(),
    operatorName: "Vận hành mẫu",
    managerName: "Quản lý mẫu",
    requiredBadgeCount: rewardBadgeCatalog.length,
    displayPoints,
    season: { name: "Mùa đông", description: "vững vàng", cefr: level },
    cefrLabel: level,
    badges: rewardBadgeCatalog.map(([key, label, description]) => ({ key, label, description, earned: true }))
  };
  const print = () => {
    const style = document.createElement("style");
    style.id = "manager-reward-print-style";
    style.textContent = "@media print { @page { size: A4 landscape; margin: 10mm; } .rw .cert-doc { break-inside: avoid; } }";
    document.getElementById(style.id)?.remove();
    document.head.appendChild(style);
    const cleanup = () => { style.remove(); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup, { once: true });
    try { window.print(); } catch (error) { cleanup(); throw error; }
  };
  return <div className="rw reward-page manager-page manager-certificate-page">
    <p className="reward-preview-note no-print" role="note"><b>Bản xem trước</b> · Dữ liệu giả lập.</p>
    <BadgeCertificate view={view} preview />
    <CertificateActions>
      <button className="btn" type="button" onClick={print}>In / lưu PDF</button>
      <Link className="btn btn-primary" to="/mgr/rewards">← Quay lại</Link>
    </CertificateActions>
  </div>;
}
