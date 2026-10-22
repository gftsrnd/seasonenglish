export function conciseLessonObjective(value: string | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "—";
  const firstSentence = normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? normalized;
  const concise = firstSentence
    .replace(/^Sau bài học,\s*(?:bạn|học viên)\s*có thể\s*/i, "")
    .replace(/^Sau bài này,\s*(?:bạn|học viên)\s*có thể\s*/i, "")
    .replace(/\s+để nói về một bản báo cáo hoặc công việc của đồng nghiệp/iu, " để nhận xét công việc")
    .trim();
  return concise ? concise.charAt(0).toLocaleUpperCase("vi") + concise.slice(1) : firstSentence;
}

export function conciseSpeakingInstruction(value: string | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (/\b(?:positive|good point|could be better|colleague|feedback|report)\b/i.test(normalized)) {
    return "Nói một điểm tốt về công việc. Sau đó góp ý một điểm cần cải thiện thật lịch sự.";
  }
  if (/^(?:nói|đọc|nghe|viết|hãy|chọn|điền)\b/iu.test(normalized) || /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/iu.test(normalized)) {
    return normalized.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? normalized;
  }
  return "Nói theo câu mẫu bên dưới và thay đổi một chi tiết cho phù hợp.";
}

export function conciseSpeakingModel(value: string | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "—";
  return normalized.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? normalized;
}

export function conciseGrammarExample(value: string | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "—";
  const englishOnly = normalized.replace(/\s*\([^)]*[À-ỹ][^)]*\)\s*$/iu, "").trim();
  const sentence = englishOnly.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? englishOnly;
  const words = sentence.split(/\s+/).filter(Boolean);
  return words.length <= 12 ? sentence : `${words.slice(0, 12).join(" ").replace(/[,:;.!?]+$/, "")}.`;
}
