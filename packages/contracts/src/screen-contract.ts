export type ProductRole = "public" | "learner" | "operator" | "manager";

export interface VisibleScreen {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly roles: readonly ProductRole[];
  readonly purpose: string;
  readonly states?: readonly string[];
}

export const SCREEN_CONTRACT = [
  { id: "entry", path: "/", title: "Đăng nhập", roles: ["public"], purpose: "Learner, staff và demo vào đúng cổng; role do tài khoản quyết định" },
  { id: "onboard", path: "/onboard", title: "Hồ sơ ban đầu", roles: ["learner"], purpose: "Hoàn thiện hồ sơ học tập trước bài test" },
  { id: "test", path: "/test/:kind", title: "Bài test", roles: ["learner"], purpose: "Thực hiện placement hoặc level-up trong một screen flow", states: [
    "preparation", "listening", "reading", "writing", "speaking", "submitting", "pending",
    "test.intro.fresh", "test.intro.resume", "test.review-submit",
    "test.timer.warning-5m", "test.timer.warning-1m", "test.timer.expired-transition", "test.timer.expired-submit",
    "test.anti-cheat.warning", "test.anti-cheat.warning.1..limit", "test.anti-cheat.auto-submit",
    "test.device.sound", "test.device.mic.supported", "test.device.mic.unsupported", "test.device.mic.recording", "test.device.mic.playback",
    "test.submit.confirm", "test.submit.countdown", "test.submit.grading", "test.submit.complete", "test.submit.error"
  ] },
  { id: "learner-home", path: "/home", title: "Trang chủ", roles: ["learner"], purpose: "Onboarding status hoặc chương trình tuần và bài hôm nay" },
  { id: "lesson", path: "/lesson/:id", title: "Bài học", roles: ["learner"], purpose: "Học đúng trình tự nội dung đã xác nhận" },
  { id: "coach", path: "/coach", title: "Luyện với Season", roles: ["learner"], purpose: "Hội thoại, nhận phản hồi và làm lại trong cùng màn" },
  { id: "level-challenge", path: "/challenge", title: "Thử thách lên mức", roles: ["learner"], purpose: "Làm tiếp hoặc hoàn thành thử thách đủ điều kiện" },
  { id: "games", path: "/games", title: "Mini game", roles: ["learner"], purpose: "Chọn mini game" },
  { id: "game-detail", path: "/games/:game", title: "Mini game", roles: ["learner"], purpose: "Chơi một mini game" },
  { id: "monthly-exam", path: "/exam", title: "Bài thi tháng", roles: ["learner"], purpose: "Xem báo cáo điểm danh, điều kiện và vào bài thi tháng" },
  { id: "learner-profile", path: "/profile", title: "Tiến độ & hồ sơ", roles: ["learner"], purpose: "Xem tiến bộ và cập nhật hồ sơ" },
  { id: "reward", path: "/reward/:mode", title: "Chứng nhận & phần thưởng", roles: ["learner", "manager"], purpose: "Xem trước hoặc nhận chứng nhận" },
  { id: "survey", path: "/survey", title: "Khảo sát cuối pilot", roles: ["learner"], purpose: "Gửi khảo sát cuối pilot" },
  { id: "level-approval", path: "/op", title: "Duyệt trình độ", roles: ["operator", "manager"], purpose: "Xem evidence và duyệt mức" },
  { id: "level-forms", path: "/op/levelforms", title: "Đề thi lên mức", roles: ["operator", "manager"], purpose: "Tạo, xem và duyệt đề lên mức" },
  { id: "month-frameworks", path: "/op/months", title: "Bài học", roles: ["operator", "manager"], purpose: "Sinh, duyệt khung tháng, chia bài ngày và bài thi tháng cho từng level" },
  { id: "sample-review", path: "/op/review", title: "Kháng nghị & phản hồi", roles: ["operator", "manager"], purpose: "Xem phản hồi AI Coach, kháng nghị và lịch sử làm bài" },
  { id: "prompt-rubric", path: "/op/prompts", title: "Prompt & rubric", roles: ["operator", "manager"], purpose: "Điều chỉnh hướng dẫn AI theo quyền chuyên môn" },
  { id: "settings", path: "/settings", title: "Cài đặt", roles: ["operator", "manager"], purpose: "Cấu hình nghiệp vụ, AI, người dùng và quyền theo vai trò" },
  { id: "manager-progress", path: "/mgr", title: "Tiến độ", roles: ["manager"], purpose: "Theo dõi tiến độ nhóm và KPI", states: ["loading", "empty", "error", "populated"] },
  { id: "manager-operations", path: "/mgr/ops", title: "Vận hành", roles: ["manager"], purpose: "Theo dõi hiệu suất vận hành", states: ["loading", "empty", "error", "populated"] },
  { id: "manager-month", path: "/mgr/month", title: "Tháng học", roles: ["manager"], purpose: "Khiếu nại thi tháng (24 giờ), báo cáo xin mở tháng sau, tài khoản khoá vì vắng", states: ["loading", "empty", "error", "populated"] },
  { id: "manager-reminders", path: "/mgr/reminders", title: "Nhắc học", roles: ["manager"], purpose: "Xác định và gửi nhắc học", states: ["loading", "empty", "error", "populated"] },
  { id: "manager-report", path: "/mgr/report", title: "Báo cáo", roles: ["manager"], purpose: "Xem và xuất báo cáo pilot", states: ["loading", "empty", "error", "populated"] },
  { id: "manager-rewards", path: "/mgr/rewards", title: "Giả lập phần thưởng", roles: ["manager"], purpose: "Xem trước các trường hợp phần thưởng", states: ["loading", "empty", "error", "populated"] }
] as const satisfies readonly VisibleScreen[];

export const ROLE_NAVIGATION = {
  learner: ["/home", "/coach", "/exam", "/games", "/profile"],
  operator: ["/op", "/op/months", "/op/review", "/settings"],
  manager: ["/mgr", "/mgr/ops", "/mgr/month", "/mgr/reminders", "/mgr/report", "/settings"]
} as const;

export type ScreenId = (typeof SCREEN_CONTRACT)[number]["id"];
export type VisibleRoute = (typeof SCREEN_CONTRACT)[number]["path"];
