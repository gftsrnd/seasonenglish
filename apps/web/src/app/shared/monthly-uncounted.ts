/** Học thử notice: a learner approved after more than 25% of the month studies it, but it counts from next month. */
export const MONTHLY_UNCOUNTED_TITLE = "Tháng này bạn học thử để làm quen.";

/** "Tiến độ, điểm danh và thi tháng bắt đầu tính từ tháng sau (dd/mm)." from an ISO date. */
export function monthlyUncountedCountsFromText(countsFrom: string | null | undefined): string {
  const date = countsFrom && /^\d{4}-\d{2}-\d{2}$/u.test(countsFrom) ? ` (${countsFrom.slice(8, 10)}/${countsFrom.slice(5, 7)})` : "";
  return `Tiến độ, điểm danh và thi tháng bắt đầu tính từ tháng sau${date}.`;
}

export function monthlyUncountedText(countsFrom: string | null | undefined): string {
  return `${MONTHLY_UNCOUNTED_TITLE} ${monthlyUncountedCountsFromText(countsFrom)}`;
}
