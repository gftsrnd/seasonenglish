import { useId, useState } from "react";
import { Smile } from "lucide-react";

type MouthForm = { image: string; description: string };

const forms: Record<string, MouthForm> = {
  "iː": { image: "ii (team).png", description: "Lưỡi nâng cao ở phía trước; môi mở nhẹ." }, "ɪ": { image: "i (list).png", description: "Lưỡi ở phía trước, thấp hơn /iː/; môi thư giãn." },
  e: { image: "e (desk).png", description: "Hàm mở vừa; lưỡi ở phía trước và thấp hơn /ɪ/." }, "eɪ": { image: "ei (wait).png", description: "Bắt đầu ở nguyên âm trước mở vừa rồi nâng lưỡi lên khi lướt về /ɪ/." }, "æ": { image: "ae (plan).png", description: "Hàm mở rộng; lưỡi thấp ở phía trước." },
  "ə": { image: "schwa (agenda).png", description: "Lưỡi thả lỏng ở giữa miệng; hàm mở nhẹ." }, "ʌ": { image: "uh (lunch).png", description: "Lưỡi ở giữa và hơi thấp; môi không tròn." }, "ɜː": { image: "er (work).png", description: "Lưỡi ở giữa, thân lưỡi nâng vừa; môi thả lỏng." },
  "ɑː": { image: "aa (task).png", description: "Hàm mở rộng; lưỡi thấp và lùi về sau." }, "ɒ": { image: "o (office).png", description: "Hàm mở; lưỡi thấp phía sau và môi tròn." }, "ɔː": { image: "oo (call).png", description: "Lưỡi nâng vừa ở phía sau; môi tròn." },
  "ʊ": { image: "u (book).png", description: "Lưỡi nâng ở phía sau; môi tròn nhẹ." }, "uː": { image: "uu (room).png", description: "Lưỡi nâng cao phía sau; môi tròn và đưa ra trước." },
  "aɪ": { image: "ai (time).png", description: "Bắt đầu với hàm mở và lưỡi thấp; lướt lên trước miệng." }, "aʊ": { image: "au (now).png", description: "Bắt đầu với hàm mở; lưỡi lùi và môi tròn dần." }, "ɔɪ": { image: "oi (join).png", description: "Bắt đầu với lưỡi sau và môi tròn; lướt lên phía trước." }, "əʊ": { image: "eu (phone).png", description: "Bắt đầu ở giữa miệng; lưỡi lùi và môi tròn dần." },
  "ɪə": { image: "ie (clear).png", description: "Bắt đầu ở phía trước; lướt về nguyên âm giữa /ə/." }, "eə": { image: "ea (share).png", description: "Bắt đầu ở trước, hàm mở vừa; lướt về /ə/." }, "ʊə": { image: "ua (tour).png", description: "Bắt đầu ở phía sau với môi tròn; lướt về /ə/." },
  p: { image: "p (project).png", description: "Khép hai môi rồi bật hơi ra." }, b: { image: "b (budget).png", description: "Khép hai môi rồi bật âm hữu thanh." }, m: { image: "m (meeting).png", description: "Khép hai môi; luồng hơi đi qua mũi." },
  f: { image: "f (file).png", description: "Răng trên chạm nhẹ môi dưới; thổi hơi qua khe." }, v: { image: "v (review).png", description: "Răng trên chạm môi dưới; rung dây thanh." },
  "θ": { image: "th (thanks).png", description: "Đặt đầu lưỡi nhẹ giữa hai hàm răng và thổi hơi." }, "ð": { image: "dh (this).png", description: "Đặt đầu lưỡi giữa hai hàm răng; rung dây thanh." },
  t: { image: "t (task).png", description: "Đầu lưỡi chạm lợi ngay sau răng trên rồi bật ra." }, d: { image: "d (deadline).png", description: "Đầu lưỡi chạm lợi sau răng trên; rung dây thanh." }, s: { image: "s (sales).png", description: "Đầu lưỡi gần lợi sau răng trên; hơi đi qua khe hẹp." }, z: { image: "z (zoom).png", description: "Đầu lưỡi gần lợi sau răng trên; rung dây thanh." }, n: { image: "n (name).png", description: "Đầu lưỡi chạm lợi sau răng trên; hơi thoát qua mũi." }, l: { image: "l (lunch).png", description: "Đầu lưỡi chạm lợi sau răng trên; hai bên lưỡi hạ." }, r: { image: "r (report).png", description: "Lưỡi cong nhẹ về sau, không chạm vòm miệng." },
  "ʃ": { image: "sh (share).png", description: "Lưỡi hơi lùi sau lợi; môi hơi tròn." }, "ʒ": { image: "zh (decision).png", description: "Lưỡi hơi lùi sau lợi; môi hơi tròn và rung dây thanh." }, "tʃ": { image: "ch (check).png", description: "Lưỡi chạm phía sau lợi rồi nhả thành luồng hơi." }, "dʒ": { image: "j (job).png", description: "Lưỡi chạm phía sau lợi rồi nhả; rung dây thanh." },
  k: { image: "k (client).png", description: "Phần sau lưỡi chạm vòm mềm rồi bật ra." }, g: { image: "g (agree).png", description: "Phần sau lưỡi chạm vòm mềm; rung dây thanh." }, "ŋ": { image: "ng (meeting).png", description: "Phần sau lưỡi chạm vòm mềm; hơi thoát qua mũi." },
  h: { image: "h (help).png", description: "Miệng mở theo nguyên âm kế tiếp; hơi đi qua thanh môn." }, j: { image: "y (year).png", description: "Thân lưỡi nâng gần vòm cứng; môi thư giãn." }, w: { image: "w (work).png", description: "Môi tròn và đưa ra trước; lưỡi nâng phía sau." }
};

export function PronunciationMouthForm({ target, language = "vi" }: { target: string; language?: "vi" | "en" }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const key = target.trim().replace(/^\/+|\/+$/gu, "").toLocaleLowerCase();
  const form = forms[key];
  if (!form) return null;
  const description = language === "en" ? `Mouth position for /${key}/: ${form.description}` : `Khẩu hình cho âm /${key}/: ${form.description}`;
  return <div className="lesson-pronunciation-mouth">
    <button className="btn-sm btn-ghost lesson-pronunciation-mouth__toggle" type="button" aria-expanded={open} aria-controls={panelId} aria-label={language === "en" ? `Show mouth position for /${key}/` : `Xem khẩu hình âm /${key}/`} title={language === "en" ? "Show mouth position" : "Xem khẩu hình"} onClick={() => setOpen((value) => !value)}><Smile size={18} aria-hidden="true" /></button>
    {open ? <div className="lesson-pronunciation-mouth__panel" id={panelId}><img src={`/media/ipa-mouth-form/${encodeURIComponent(form.image)}`} alt={description} /><p>{form.description}</p></div> : null}
  </div>;
}
