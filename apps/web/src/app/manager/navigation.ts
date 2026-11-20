export const managerOperationTabs = [
  { to: "/mgr/ops", label: "Hiệu suất vận hành", description: "Theo dõi công việc của Vận hành." },
  { to: "/mgr/holidays", label: "Ngày nghỉ lễ", description: "Quản lý lịch nghỉ của tổ chức." }
] as const;

export const operatorReadOnlyTabs = [
  { to: "/mgr/ops/levels", label: "Duyệt mức", title: "Duyệt trình độ", description: "Theo dõi kết quả xếp mức học viên." },
  { to: "/mgr/ops/months", label: "Sinh bài", title: "Nội dung tháng", description: "Xem chủ đề, tài nguyên và lịch học." },
  { to: "/mgr/ops/review", label: "Phản hồi & yêu cầu", title: "Chấm & Kháng nghị", description: "Xem phản hồi Season và kháng nghị." },
  { to: "/mgr/ops/tests", label: "Kết quả bài thi", description: "Xem đề và kết quả đầu vào, bài thi tháng, đề lên mức và đề đầu ra." }
] as const;

export function managerNavigationPath(pathname: string) {
  const path = pathname.replace(/\/+$/u, "");
  if (path === "/mgr/ops/level-forms") return "/mgr/ops/tests";
  if (path.startsWith("/mgr/ops/months/lesson/")) return "/mgr/ops/months";
  return path;
}

export const managerSections = [
  {
    id: "tracking", label: "Theo dõi", to: "/mgr",
    items: [
      { to: "/mgr", label: "Tiến độ nhóm" },
      { to: "/mgr/reminders", label: "Nhắc học viên", title: "Nhắc học" },
      { to: "/mgr/report", label: "Báo cáo tổng kết" },
      { to: "/mgr/surveys", label: "Khảo sát tháng", title: "Khảo sát hằng tháng" }
    ]
  },
  {
    id: "operations", label: "Vận hành", to: "/mgr/ops",
    items: [...managerOperationTabs, ...operatorReadOnlyTabs]
  },
  {
    id: "requests", label: "Yêu cầu", to: "/mgr/requests", items: []
  }
] as const;

export function managerSectionForPath(pathname: string) {
  if (pathname === "/mgr/requests") return managerSections[2];
  const section = managerSections.find(section => section.items.some(item => item.to !== "/mgr" && (pathname === item.to || pathname.startsWith(`${item.to}/`))));
  if (section) return section;
  return pathname === "/mgr" || pathname.startsWith("/mgr/") ? managerSections[0] : undefined;
}
