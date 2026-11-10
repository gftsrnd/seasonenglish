import { getSolarDate } from "vietnamese-lunar";
import { buildMonthlyCalendar } from "./curriculum.js";

export interface VietnamHoliday {
  date: string;
  name: string;
  source: "national" | "organization";
  sourceUrl?: string;
}
export interface MonthlyCalendarDay {
  date: string;
  kind: "new" | "review" | "weekend" | "exam";
  lessonNumber?: number;
  newLessonNumber?: number;
  reviewWeekNumber?: number;
  holiday?: VietnamHoliday;
  holidayExamConflict?: boolean;
}

const cultureSource = "https://baochinhphu.vn/ngay-van-hoa-viet-nam-24-11-nguoi-lao-dong-duoc-nghi-lam-huong-nguyen-luong-102260424093821937.htm";
const annualSources: Record<number, string> = {
  2026: "https://xaydungchinhsach.chinhphu.vn/lich-nghi-le-gio-to-hung-vuong-30-4-1-5-quoc-khanh-2-9-nam-2026-119260222115822151.htm",
  2027: "https://moha.gov.vn/tin-tuc/thong-bao-lich-nghi-tet-am-lich-va-le-quoc-khanh-nam-2027---id19741"
};
const annualTet: Record<number, [string, string]> = { 2026: ["2026-02-16", "2026-02-20"], 2027: ["2027-02-04", "2027-02-10"] };
const annualNationalDay: Record<number, string> = { 2026: "2026-09-01", 2027: "2027-09-03" };
const dateKey = (day: number, month: number, year: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
function nextDate(date: string): string { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); }
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Vietnamese UTC+7 lunar conversion; annual leave choices are explicitly sourced.
 * Outside covered years, recognize Tet's first day without inventing the annual five-day block.
 * Company bridge/exchange days remain organization settings, not national holidays.
 */
export function vietnamPublicHolidays(year: number): VietnamHoliday[] {
  if (!Number.isInteger(year) || year < 1900 || year > 2199) throw new RangeError("Unsupported Vietnamese calendar year");
  const result: VietnamHoliday[] = [];
  const add = (date: string, name: string, sourceUrl = annualSources[year]) => result.push({ date, name, source: "national", ...(sourceUrl ? { sourceUrl } : {}) });
  for (const [date, name] of [[`${year}-01-01`, "Tết Dương lịch"], [`${year}-04-30`, "Ngày Chiến thắng"], [`${year}-05-01`, "Ngày Quốc tế Lao động"], [`${year}-09-02`, "Quốc khánh"]]) add(date!, name!);
  if (annualNationalDay[year]) add(annualNationalDay[year]!, "Quốc khánh (ngày liền kề)");
  if (year >= 2026) add(`${year}-11-24`, "Ngày Văn hóa Việt Nam", cultureSource);
  const hung = getSolarDate(10, 3, year);
  if (hung) add(dateKey(hung.day, hung.month, hung.year), "Giỗ Tổ Hùng Vương");
  const occupied = new Set(result.map(day => day.date));
  // The app's standard working week is Monday–Friday.
  for (const holiday of [...result]) {
    if (![0, 6].includes(weekday(holiday.date))) continue;
    let date = nextDate(holiday.date);
    while ([0, 6].includes(weekday(date)) || occupied.has(date)) date = nextDate(date);
    occupied.add(date); add(date, `Nghỉ bù ${holiday.name}`, holiday.sourceUrl);
  }
  const tet = annualTet[year];
  if (tet) for (let date = tet[0]; date <= tet[1]; date = nextDate(date)) add(date, "Tết Nguyên đán");
  else {
    const first = getSolarDate(1, 1, year);
    if (first) add(dateKey(first.day, first.month, first.year), "Tết Nguyên đán (mùng 1; lịch nghỉ dài do tổ chức khai báo)");
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export function mergedVietnamHolidays(month: string, organizationDates: readonly { date: string; name?: string }[] = []): VietnamHoliday[] {
  const automatic = vietnamPublicHolidays(Number(month.slice(0, 4))).filter(day => day.date.startsWith(month));
  const merged = new Map(automatic.map(day => [day.date, day]));
  for (const day of organizationDates) if (day.date.startsWith(month) && !merged.has(day.date)) merged.set(day.date, { date: day.date, name: day.name || "Ngày nghỉ của tổ chức", source: "organization" });
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildMonthlyTeachingCalendar(month: string, organizationDates: readonly { date: string; name?: string }[] = []): MonthlyCalendarDay[] {
  const calendar = buildMonthlyCalendar(month);
  const holidays = new Map(mergedVietnamHolidays(month, organizationDates).map(day => [day.date, day]));
  const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  let n = 0;
  const weekKeys: string[] = [];
  return Array.from({ length: count }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const dow = weekday(date);
    const kind = date === calendar.examDate ? "exam" : dow === 0 || dow === 6 ? "weekend" : dow === 5 ? "review" : "new";
    const lessonIndex = calendar.effectiveDays.indexOf(date);
    const monday = new Date(`${date}T12:00:00Z`); monday.setUTCDate(monday.getUTCDate() - (dow || 7) + 1);
    const key = monday.toISOString().slice(0, 10);
    if (lessonIndex >= 0 && !weekKeys.includes(key)) weekKeys.push(key);
    const holiday = holidays.get(date);
    return { date, kind, ...(lessonIndex >= 0 ? { lessonNumber: lessonIndex + 1 } : {}), ...(kind === "new" ? { newLessonNumber: ++n } : {}), ...(kind === "review" ? { reviewWeekNumber: weekKeys.indexOf(key) + 1 } : {}), ...(holiday ? { holiday, ...(kind === "exam" ? { holidayExamConflict: true } : {}) } : {}) };
  });
}
