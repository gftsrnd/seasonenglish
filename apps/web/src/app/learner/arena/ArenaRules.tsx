import { RulesDisclosure } from "../../shared/RulesDisclosure.js";
import { useUiTier } from "../../shared/CompactUi.js";

/** Strength bands (packages/domain arena-rating.ts ratingBand): gap = opponent − you, per game. */
const BANDS: ReadonlyArray<readonly [label: string, gap: string, win: string, lose: string]> = [
  ["Đối thủ mạnh hơn nhiều", "đối thủ hơn bạn từ 500 điểm", "+90", "−10"],
  ["Đối thủ mạnh hơn", "đối thủ hơn bạn 200–499 điểm", "+75", "−25"],
  ["Ngang sức", "hai bên chênh dưới 200 điểm", "+50", "−50"],
  ["Đối thủ yếu hơn", "đối thủ kém bạn 200–499 điểm", "+25", "−75"],
  ["Đối thủ yếu hơn nhiều", "đối thủ kém bạn từ 500 điểm", "+10", "−90"]
];

const RULES = [
  "Thắng thua so điểm ván; bằng điểm thì ai chơi nhanh hơn thắng.",
  "Điểm xếp hạng tính riêng cho từng trò; ai cũng bắt đầu với 1.000 điểm. Mạnh hay yếu là so điểm xếp hạng của trò đó lúc nhận trận.",
  "Bị trừ: người thua mất đúng số điểm người thắng được (cột Thua ở bảng trên); hoà thì không ai được hay mất; điểm không xuống dưới 0.",
  "Bỏ trận, hoặc quá 24 giờ mà chưa chơi: tính thua, bị trừ điểm như bảng trên. Cả hai đều chưa chơi thì trận bị huỷ, không ai mất điểm. Huỷ thách đấu khi chưa có người nhận thì không mất điểm.",
  "Gặp lại cùng người trong ngày: lần 2 tính 50%, lần 3 tính 25%, từ lần 4 không tính.",
  "Không biết trước đối thủ xếp hạng; đã nhận thì có 24 giờ để chơi; tối đa 3 trận đang mở.",
  "Giao hữu không tính điểm xếp hạng. Mỗi mùa xếp hạng 3 tháng."
];

/** The arena rules: a strength table (win / lose points), then the other rules. */
export function ArenaRulesBody() {
  return <div className="arena-rules">
    <section className="rules-points arena-rules__bands" data-testid="arena-rating-bands">
      <section>
        <h4>Điểm xếp hạng được / mất sau mỗi trận</h4>
        <dl>{BANDS.map(([label, gap, win, lose]) => <div key={label}><dt>{label}<small>{gap}</small></dt><dd><span className="is-plus">Thắng {win}</span> · <span className="is-minus">Thua {lose}</span></dd></div>)}</dl>
      </section>
    </section>
    <section><h4>Luật khác</h4><ul className="rules-list">{RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul></section>
  </div>;
}

/** Desktop: a bold line with ▼ that opens the rules; phones/tablets use the ⓘ beside "Trận của bạn". */
export function ArenaRulesLine() {
  return useUiTier() === "desktop" ? <RulesDisclosure title="Cách tính điểm xếp hạng" className="arena-rules-line"><ArenaRulesBody /></RulesDisclosure> : null;
}
