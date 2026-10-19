import { Link } from "react-router";

const previewBadges = [
  ["🐣", "Khởi động", "Hoàn thành bài học đầu tiên"], // media-scan: allow-avatar-reward -- deliberate badge symbol
  ["📅", "Tuần trọn vẹn", "Xong tất cả bài của một tuần"], // media-scan: allow-avatar-reward -- deliberate badge symbol
  ["🔥", "Chuỗi 3 ngày", "Học 3 ngày học liên tiếp (T2–T6)"], // media-scan: allow-avatar-reward -- deliberate badge symbol
  ["🌟", "Chuỗi 5 ngày", "Học 5 ngày học liên tiếp (T2–T6), không tính cuối tuần"], // media-scan: allow-avatar-reward -- deliberate badge symbol
  ["🎯", "Chuẩn ngay lần đầu", "Làm đúng cả 4 kỹ năng Nghe, Đọc, Viết, Nói của một bài ngay ở lần làm đầu tiên"], // media-scan: allow-avatar-reward -- deliberate badge symbol
  ["🔑", "Thợ mở khoá", "Mở 10 ô từ bí mật khi chat với Season"], // media-scan: allow-avatar-reward -- deliberate badge symbol
  ["💬", "Bạn của Season", "10 lượt luyện với Season"], // media-scan: allow-avatar-reward -- deliberate badge symbol
  ["✍️", "Đúng hẹn thứ Sáu", "Nộp bài thực hành tuần"] // media-scan: allow-avatar-reward -- deliberate badge symbol
] as const;

/** The Manager reward link is a deterministic CMS preview, never a learner certificate. */
export function ManagerRewardCertificate() {
  const date = new Date();
  const longDate = `ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
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
  return <div className="rw manager-page manager-certificate-page">
    <div className="banner info no-print" role="note"><div className="body small"><b>Bản xem trước.</b> Đây là chứng nhận học viên nhận được khi đạt đủ 8/8 huy hiệu; số điểm dưới đây là giả lập, không ghi vào dữ liệu học viên nào.</div></div>
    <article className="cert-doc" aria-label="Chứng nhận xem trước phần thưởng">
      <header className="cert-head"><div className="row" style={{ gap: 14, alignItems: "center" }}><img className="cert-logo" src="/gft-logo.png" alt="GFT" /><div><div className="cert-org">Season English</div><div className="xs muted">GFT Demo · Chương trình tiếng Anh nội bộ</div></div></div><div className="cert-no xs muted">Số: SE-PREVIEW</div></header>
      <div className="cert-body"><div className="eyebrow" style={{ letterSpacing: ".18em" }}>Chứng nhận hoàn thành</div><h1 className="cert-title">Certificate of Completion</h1><p className="cert-line">Chứng nhận</p><div className="cert-name">Nguyễn Văn A</div><p className="cert-line">đã hoàn thành trọn vẹn bộ 8 huy hiệu của chương trình Season English, đạt cấp <b>Mùa đông – vững vàng</b> với <b>420 điểm</b>.</p><div className="cert-facts"><div><span className="xs muted">Ngày hoàn thành</span><b>{date.toLocaleDateString("vi-VN")}</b></div><div><span className="xs muted">Huy hiệu</span><b>8/8</b></div><div><span className="xs muted">Điểm tích luỹ</span><b>420</b></div><div><span className="xs muted">Cấp độ</span><b>Mùa đông</b></div></div><div className="cert-badges">{previewBadges.map(([icon, name, description]) => <div className="cert-badge" key={name}><span className="ck">✓</span><div><b>{icon} {name}</b><div className="xs muted">{description}</div></div></div>)}</div></div>
      <div className="cert-sign"><div><div className="line" /><div className="small">Người vận hành</div><div className="xs muted">Thư Demo</div></div><div className="cert-date xs muted">GFT Demo, {longDate}</div><div><div className="line" /><div className="small">Quản lý</div><div className="xs muted">Quản lý Demo</div></div></div><div className="cert-foot xs muted">Chứng nhận được tạo tự động từ dữ liệu học trên Season English; có giá trị nội bộ. BẢN XEM TRƯỚC</div>
    </article>
    <section className="card soft manager-extra-reward no-print" aria-label="Phần thưởng kèm theo">
      <div className="eyebrow">Phần thưởng kèm theo</div>
      <p className="small">Ô này dành cho phần thưởng do công ty quyết định (quà, ngày nghỉ, vinh danh). Hiện chưa có phần thưởng nào được cấu hình, nên học viên chỉ nhận chứng nhận.</p>
    </section>
    <div className="row no-print" style={{ marginTop: 16, justifyContent: "center", gap: 8 }}><button className="btn" type="button" onClick={print}>In / lưu chứng nhận (PDF, 1 trang A4 ngang)</button><Link className="btn btn-primary" to="/mgr/rewards">← Quay lại</Link></div>
  </div>;
}
