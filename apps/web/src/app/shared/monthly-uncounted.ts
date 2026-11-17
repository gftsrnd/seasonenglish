/** Format the date official counting begins for the trial notification. */
export function monthlyUncountedCountsFromText(countsFrom: string | null | undefined): string {
  const date = countsFrom && /^\d{4}-\d{2}-\d{2}$/u.test(countsFrom) ? ` (${countsFrom.slice(8, 10)}/${countsFrom.slice(5, 7)})` : "";
  return `Tiến độ chính thức, điểm danh, thi tháng và xét lên mức bắt đầu từ tháng sau${date}.`;
}
