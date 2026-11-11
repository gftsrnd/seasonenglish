const sectionLabels: Record<string, string> = { listening: "Nghe", reading: "Đọc", writing: "Viết", grammar: "Ngữ pháp", pronunciation: "Phát âm", vocabulary: "Từ vựng", speaking: "Nói", word_class: "Từ loại", word_use: "Dùng từ" };

/**
 * nginx closes a long monthly resource request after proxy_read_timeout (504)
 * while the API keeps generating and checkpointing. That is not a failure: the
 * Operator should keep watching the existing progress endpoint.
 */
export function isGatewayTimeout(reason: unknown): boolean {
  const error = reason && typeof reason === "object" ? reason as { code?: unknown; status?: unknown } : {};
  return error.status === 504 || error.code === "HTTP_504";
}

/** Describe the failed stage without displaying model output, validator text or technical codes. */
export function monthlyGenerationMessage(reason: unknown): string {
  const error = reason && typeof reason === "object" ? reason as { code?: string; details?: { report?: { severe?: Array<{ component?: string }> }; issues?: Array<{ component?: string }>; components?: string[] } } : {};
  const details = error.details;
  const components = [...(details?.report?.severe ?? []), ...(details?.issues ?? [])].flatMap(item => item.component ?? []);
  const sections = [...new Set([...components, ...(details?.components ?? [])].map(code => sectionLabels[code]).filter(Boolean))];
  const where = sections.length ? ` ở phần ${sections.join(", ")}` : "";
  if (error.code === "AI_OUTPUT_INVALID") return `AI trả về nội dung chưa đúng cấu trúc${where}. Chưa lưu bản nháp; hãy thử sinh lại.`;
  if (error.code === "AI_OUTPUT_TRUNCATED") return `Nội dung AI trả về bị ngắt giữa chừng${where}. Chưa lưu bản nháp; hãy thử sinh lại.`;
  if (error.code === "AI_TIMEOUT") return "AI phản hồi quá lâu. Chưa lưu bản nháp; hãy thử lại sau.";
  if (error.code === "AI_PROVIDER_RATE_LIMIT") return "Dịch vụ AI đang giới hạn lượt gọi. Chưa lưu bản nháp; hãy chờ rồi thử lại.";
  if (error.code === "NETWORK_UNAVAILABLE") return "Mất kết nối khi sinh bài. Hãy kiểm tra mạng trước khi thử lại.";
  return sections.length ? `Bài sinh chưa đạt yêu cầu${where}. Chưa lưu bản nháp; hãy thử lại.` : "Không sinh được bài học. Hãy thử lại.";
}

export function monthlyFinalGenerationMessage(reason:unknown):string {
  const error=reason && typeof reason === "object" ? reason as {code?:string;details?:{report?:{checks?:Array<{code:string}>}}} : {};
  const labels:Record<string,string>={GEN04:"độ phủ từ",GEN10:"bằng chứng ngữ pháp",GEN11:"từ luyện âm",GEN18:"bảo mật đề học viên",GEN22:"độ dài và level"};
  if(error.code === "MONTHLY_FINAL_GENERATION_QUALITY_FAILED") {
    const areas=[...new Set((error.details?.report?.checks??[]).map(check=>labels[check.code]??"kiểm tra nội dung"))];
    return `Đề mới chưa đạt yêu cầu${areas.length ? ` về ${areas.join(", ")}` : ""}. Chưa thay bản nháp hiện có; hãy thử sinh lại.`;
  }
  if(error.code === "AI_OUTPUT_INVALID")return "AI chưa tạo được đề tháng đạt yêu cầu sau các lượt sửa. Chưa thay bản nháp hiện có; hãy thử sinh lại.";
  if(error.code === "MONTHLY_FINAL_EXAM_DATE_LOCKED")return "Đã đến ngày thi; đề tháng đã khóa chỉnh sửa.";
  if(error.code === "MONTHLY_FINAL_ALREADY_PUBLISHED")return "Đề tháng đã phát hành. Cần mở khóa theo luồng quản lý trước khi thay đổi.";
  return "Không sinh được đề thi tháng. Bản nháp hiện có vẫn được giữ; hãy thử lại.";
}
