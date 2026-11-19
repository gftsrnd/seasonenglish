import { RulesDisclosure } from "../../shared/RulesDisclosure.js";
import { useUiTier } from "../../shared/CompactUi.js";

/** Strength bands (packages/domain arena-rating.ts ratingBand): gap = opponent − you, per game. */
const BANDS: ReadonlyArray<readonly [label: string, gap: string, win: string, lose: string]> = [
  ["Đối thủ mạnh hơn nhiều", "hơn bạn từ 500", "+90", "−10"],
  ["Đối thủ mạnh hơn", "hơn bạn 200–499", "+75", "−25"],
  ["Ngang sức", "chênh dưới 200", "+50", "−50"],
  ["Đối thủ yếu hơn", "kém bạn 200–499", "+25", "−75"],
  ["Đối thủ yếu hơn nhiều", "kém bạn từ 500", "+10", "−90"]
];

const RULES = [
  "Thắng thua so điểm ván; bằng điểm thì ai chơi nhanh hơn thắng.",
  "Mỗi trò có điểm xếp hạng riêng, bắt đầu 1.000. Mạnh/yếu so điểm của trò đó lúc nhận trận.",
  "Gặp lại cùng người trong ngày: lần 2 tính 50%, lần 3 tính 25%, từ lần 4 không tính.",
  "Không biết trước đối thủ xếp hạng; đã nhận phải đấu trong 24 giờ, quá hạn tính thua; tối đa 3 trận đang mở.",
  "Giao hữu không tính điểm xếp hạng. Mỗi mùa xếp hạng 3 tháng."
];

/** The arena rules: a strength table (win / lose points), then the other rules. */
export function ArenaRulesBody() {
  return <div className="arena-rules">
    <section className="rules-points arena-rules__bands" data-testid="arena-rating-bands">
      <section>
        <h4>Điểm xếp hạng mỗi trận</h4>
        <dl>{BANDS.map(([label, gap, win, lose]) => <div key={label}><dt>{label}<small>{gap}</small></dt><dd>{win} / <span className="is-minus">{lose}</span></dd></div>)}</dl>
      </section>
    </section>
    <section><h4>Luật khác</h4><ul className="rules-list">{RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul></section>
  </div>;
}

/** Desktop: a bold line with ▼ that opens the rules; phones/tablets use the ⓘ beside "Trận của bạn". */
export function ArenaRulesLine() {
  return useUiTier() === "desktop" ? <RulesDisclosure title="Cách tính điểm xếp hạng" className="arena-rules-line"><ArenaRulesBody /></RulesDisclosure> : null;
}
