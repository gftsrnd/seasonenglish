import type { FormEvent } from "react";
import type { LearnerProfileData } from "@e4s/contracts";

export interface OnboardProps {
  initialProfile: Partial<LearnerProfileData>;
  onSave: (profile: LearnerProfileData) => void | Promise<void>;
  saving?: boolean;
  error?: string;
}

export function Onboard({ initialProfile, onSave, saving = false, error }: OnboardProps) {
  const isEditing = Boolean(initialProfile.fullName || initialProfile.email);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const certificates = data.getAll("certificateType").map(String).map((type) => {
      const year = String(data.get(`certificateYear:${type}`) ?? "");
      return {
        type,
        result: String(data.get(`certificateResult:${type}`) ?? ""),
        ...(year ? { year } : {})
      };
    });
    void onSave({
      fullName: String(data.get("fullName") ?? ""),
      email: String(data.get("email") ?? ""),
      department: String(data.get("department") ?? ""),
      position: String(data.get("position") ?? ""),
      contact: String(data.get("contact") ?? ""),
      goals: data.getAll("goals").map(String),
      environmentUse: String(data.get("environmentUse") ?? ""),
      familyUse: String(data.get("familyUse") ?? ""),
      habits: data.getAll("habits").map(String),
      situations: String(data.get("situations") ?? ""),
      learningStyles: data.getAll("learningStyles").map(String),
      explanationLanguage: "auto",
      persona: String(data.get("persona") ?? "informal") as "informal" | "formal",
      durationMinutes: Number(data.get("durationMinutes") ?? 10) as 5 | 10 | 15 | 20,
      device: String(data.get("device") ?? "both") as "phone" | "computer" | "both",
      selfLevel: String(data.get("selfLevel") ?? "unknown") as LearnerProfileData["selfLevel"],
      experience: String(data.get("experience") ?? ""),
      concerns: String(data.get("concerns") ?? ""),
      certificates,
      ...(initialProfile.avatar ? { avatar: initialProfile.avatar } : {})
    });
  };

  return <main className="learner-page learner-page--form">
    <a className="back-link" href={isEditing ? "/profile" : "/home"}>← Quay lại</a>
    <header className="page-heading">
      <p className="eyebrow">Hồ sơ</p>
      <h1>{isEditing ? "Sửa hồ sơ của bạn" : "Hoàn thiện hồ sơ của bạn"}</h1>
      <p className="profile-intro">Mình dùng thông tin này để chọn ví dụ sát công việc và cách học hợp với bạn. Khoảng 2 phút thôi.</p>
      <p className="required-note">Các mục có dấu <strong>* bắt buộc</strong> là bắt buộc; các mục còn lại có thể bỏ trống.</p>
    </header>
    <form onSubmit={submit} aria-describedby={error ? "profile-error" : undefined}>
      <fieldset className="form-section">
        <legend>Thông tin cá nhân</legend>
        <label>Họ tên <span aria-hidden="true">*</span>
          <input name="fullName" required defaultValue={initialProfile.fullName ?? ""} autoComplete="name" />
        </label>
        <label>Email <span aria-hidden="true">*</span>
          <input name="email" type="email" required defaultValue={initialProfile.email ?? ""} autoComplete="email" />
        </label>
        <label>Phòng ban / team
          <input name="department" defaultValue={initialProfile.department ?? ""} />
        </label>
        <label>Vị trí công việc
          <input name="position" defaultValue={initialProfile.position ?? ""} />
        </label>
        <label>Base username nhận nhắc học
          <input name="contact" defaultValue={initialProfile.contact ?? ""} placeholder="VD: @lan.nguyen" />
        </label>
        <ChoiceSet name="goals" title="Bạn dùng tiếng Anh ở công ty cho việc gì?" multiple required values={initialProfile.goals} options={[
          ["customer", "Nói chuyện với khách hàng / đối tác"], ["email", "Viết email, tin nhắn công việc"],
          ["meeting", "Họp và trình bày"], ["docs", "Đọc tài liệu, spec kỹ thuật"],
          ["career", "Thăng tiến / phỏng vấn"], ["confidence", "Tự tin hơn khi nói"]
        ]} />
        <ChoiceSet name="environmentUse" title="Mức độ dùng tiếng Anh trong môi trường làm việc?" required value={initialProfile.environmentUse} options={[
          ["daily", "Hằng ngày"], ["weekly", "Vài lần mỗi tuần"], ["monthly", "Thỉnh thoảng"], ["rarely", "Hiếm khi / chưa dùng"]
        ]} />
        <ChoiceSet name="familyUse" title="Mức độ sử dụng tiếng Anh trong gia đình bạn?" required value={initialProfile.familyUse} options={[
          ["daily", "Hằng ngày"], ["weekly", "Vài lần mỗi tuần"], ["sometimes", "Thỉnh thoảng"], ["none", "Không dùng"]
        ]} />
        <ChoiceSet name="habits" title="Thói quen dùng tiếng Anh ngoài công việc?" multiple required values={initialProfile.habits} options={[
          ["movies", "Xem phim / video"], ["podcast", "Nghe nhạc / podcast"], ["documents", "Đọc tin tức, tài liệu"],
          ["social", "Mạng xã hội, chat"], ["conversation", "Nói chuyện với người nước ngoài"], ["course", "Học qua app / khoá học"],
          ["none", "Chưa có thói quen nào"]
        ]} />
        <label>Tình huống cụ thể hay gặp
          <textarea name="situations" defaultValue={initialProfile.situations ?? ""} />
        </label>
      </fieldset>

      <fieldset className="form-section">
        <legend>Phong cách học yêu thích</legend>
        <ChoiceSet name="learningStyles" title="Bạn học hiệu quả nhất khi…" multiple required values={initialProfile.learningStyles} options={[
          ["reading", "Đọc và ghi chú"], ["listening", "Nghe và nhắc lại"], ["speaking", "Nói / hội thoại"],
          ["quiz", "Trắc nghiệm, điền từ"], ["writing", "Viết câu, viết email"], ["examples", "Ví dụ sát việc đang làm"],
          ["challenge", "Thử thách ngắn, có điểm"]
        ]} />
        <div className="information-note"><strong>Ngôn ngữ giải thích</strong><p>Tự động theo trình độ: A1–A2 giải thích bằng tiếng Việt; B1 trở lên bằng tiếng Anh.</p></div>
        <ChoiceSet name="persona" title="Phong cách của Season" required value={initialProfile.persona} options={[
          ["informal", "Informal · Thân thiện — câu ngắn, tự nhiên, có thể dùng emoji"],
          ["formal", "Formal · Trang trọng — câu đầy đủ, lịch sự, phù hợp họp và email"]
        ]} />
        <ChoiceSet name="durationMinutes" title="Mỗi buổi học bao lâu là vừa?" required value={String(initialProfile.durationMinutes ?? 10)} options={[
          ["5", "5 phút"], ["10", "10 phút"], ["15", "15 phút"], ["20", "20+ phút"]
        ]} />
        <div className="information-note"><strong>Lịch học</strong><p>Cố định 5 ngày/tuần (T2–T6), mỗi ngày 1 bài; cuối tuần có bài thực hành.</p></div>
        <ChoiceSet name="device" title="Thiết bị hay dùng" required value={initialProfile.device} options={[
          ["phone", "Điện thoại"], ["computer", "Máy tính"], ["both", "Cả hai"]
        ]} />
      </fieldset>

      <fieldset className="form-section">
        <legend>Về tiếng Anh của bạn</legend>
        <ChoiceSet name="selfLevel" title="Bạn tự thấy trình độ mình ở đâu?" required value={initialProfile.selfLevel} options={[
          ["unknown", "Không rõ"], ["A1", "Mới bắt đầu (A1)"], ["A2", "Sơ cấp (A2)"],
          ["B1", "Trung cấp (B1)"], ["B2", "Khá (B2)"], ["C1", "Tốt (C1)"]
        ]} />
        <CertificateFields certificates={initialProfile.certificates ?? []} />
        <label>Đã học tiếng Anh thế nào trước đây?
          <input name="experience" defaultValue={initialProfile.experience ?? ""} />
        </label>
        <label>Điều bạn lo ngại hoặc muốn Season giúp nhất
          <textarea name="concerns" defaultValue={initialProfile.concerns ?? ""} />
        </label>
      </fieldset>
      {error ? <p id="profile-error" role="alert">{error}</p> : null}
      <div className="form-actions"><a className="button" href={isEditing ? "/profile" : "/home"}>← Quay lại</a><a className="button" href={isEditing ? "/profile" : "/home"}>Huỷ</a><button className="button button--primary" disabled={saving} type="submit">{saving ? "Đang lưu…" : "Lưu hồ sơ"}</button></div>
    </form>
  </main>;
}

const certificateTypes = ["IELTS", "TOEIC", "TOEFL iBT", "Cambridge", "VSTEP", "Khác"] as const;

function CertificateFields({ certificates }: { certificates: LearnerProfileData["certificates"] }) {
  return <fieldset className="certificate-fields">
    <legend>Chứng chỉ bạn có (tuỳ chọn)</legend>
    <p>Chọn chứng chỉ và ghi kết quả, năm thi nếu có.</p>
    {certificateTypes.map((type) => {
      const saved = certificates?.find((item) => item.type === type);
      return <div className="certificate-row" key={type}>
        <label className="certificate-check"><input type="checkbox" name="certificateType" value={type} defaultChecked={Boolean(saved)} /> <span>{type}</span></label>
        <label>Kết quả {type}<input name={`certificateResult:${type}`} defaultValue={saved?.result ?? ""} /></label>
        <label>Năm {type}<input name={`certificateYear:${type}`} inputMode="numeric" defaultValue={saved?.year ?? ""} /></label>
      </div>;
    })}
  </fieldset>;
}

interface ChoiceSetProps {
  name: string;
  title: string;
  options: Array<[string, string]>;
  multiple?: boolean;
  required?: boolean;
  value?: string | undefined;
  values?: string[] | undefined;
}

function ChoiceSet({ name, title, options, multiple, required, value, values = [] }: ChoiceSetProps) {
  return <fieldset className="choice-set">
    <legend>{title}{required ? " *" : ""}</legend>
    <div className="choice-grid">{options.map(([optionValue, label]) => <label key={optionValue}>
      <input
        type={multiple ? "checkbox" : "radio"}
        name={name}
        value={optionValue}
        required={required && !multiple}
        defaultChecked={multiple ? values.includes(optionValue) : value === optionValue}
      />
      <span>{label}</span>
    </label>)}</div>
  </fieldset>;
}
