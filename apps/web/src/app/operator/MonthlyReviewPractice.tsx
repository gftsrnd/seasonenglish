import { useLayoutEffect, useRef, type ReactNode } from "react";
import { OperatorPracticeReview, type OperatorLessonPart } from "./adapters.js";
import { AudioSynthesisNotice } from "./AudioSynthesisNotice.js";
import { MONTHLY_REVIEW_SECTIONS } from "./monthly-failure-findings.js";

/**
 * Operator view of the Friday review exercises (e4s_cau_truc_bai_on_cuoi_tuan).
 * The content differs from a daily lesson (six sections, ~30 review-until-correct
 * items), but every item is shown in the same exercise card as the daily
 * practice tab, followed by its explanation and retry version.
 */
const SECTIONS = MONTHLY_REVIEW_SECTIONS;

type Item = Record<string, unknown>;
type Part = { code?: string; content?: Record<string, unknown> };

export function MonthlyReviewPractice({ parts, english = false }: { parts: readonly Part[]; english?: boolean }) {
  const itemsOf = (code: string): Item[] => {
    const value = parts.find((part) => part.code === code)?.content?.items;
    return Array.isArray(value) ? value.filter((item): item is Item => Boolean(item) && typeof item === "object") : [];
  };
  const passage = text(parts.find((part) => part.code === "reading")?.content?.passage);
  const total = SECTIONS.reduce((sum, section) => sum + itemsOf(section.code).length, 0);
  const steps = english
    ? ["Do the 6 sections in order: " + SECTIONS.map((section) => section.titleEn).join(" → ") + ".", "Read each question, choose or type the answer, then submit.", "A wrong answer shows a short explanation and comes back at the end of the section as a new question on the same point."]
    : ["Làm lần lượt 6 phần: " + SECTIONS.map((section) => section.title).join(" → ") + ".", "Đọc yêu cầu từng câu, chọn hoặc nhập câu trả lời rồi bấm Nộp bài.", "Câu sai hiện giải thích ngắn, rồi quay lại ở cuối phần bằng một câu hỏi khác cùng điểm kiến thức; phần xong khi mọi câu đã đúng một lần."];
  return <>
    <section className="card lesson-part lesson-part--instruction">
      <div className="row between"><h2>{english ? "Instructions" : "Hướng dẫn làm bài"}</h2></div>
      <p>{english ? `This review has 6 sections (${total} questions), from recognising words to speaking and writing.` : `Bài ôn gồm 6 phần (${total} câu), đi từ nhận biết từ đến tự nói và viết.`}</p>
      <ul className="lesson-instruction-list">{steps.map((step) => <li key={step}>{step}</li>)}</ul>
    </section>
    {SECTIONS.map((section, sectionIndex) => {
      const items = itemsOf(section.code);
      // B1+ previews show what the learner reads: English section names.
      const title = english ? section.titleEn : section.title;
      return <section className="card monthly-review-block" id={`review-section-${section.code}`} key={section.code} aria-label={title}>
        <header className="monthly-review-block-header"><h2>{sectionIndex + 1}. {title}</h2><span className="badge">{items.length} {english ? "questions" : "câu"}</span></header>
        {!items.length ? <p className="muted">{english ? "No items." : "Chưa có câu."}</p> : <ReviewScrollBox visible={section.code === "listening" ? 3 : 2}>{items.map((item, index) => {
          // The question label is operator chrome (the Vận hành UI is Vietnamese): always "Câu N", never "Item N".
          const heading = monthlyReviewQuestionLabel(index + 1, "operator");
          const variants = Array.isArray(item.variants) ? item.variants.filter((variant): variant is Item => Boolean(variant) && typeof variant === "object") : [];
          const showPassage = section.code === "reading" && index === 0 ? passage : "";
          return <section className={`card lesson-part lesson-part--${section.code} operator-practice-review monthly-review-card`} key={`${section.code}-${text(item.id) || index}`}>
            <OperatorPracticeReview sectionNumber={sectionIndex + 1} headingText={heading} part={asPracticePart(section.code, heading, item, showPassage, english)} />
            {text(item.audioText) ? <AudioSynthesisNotice mark={item.audioSynthesis} hasAudio={Boolean(text(item.audioUrl))} retry="học viên sẽ nghe bằng giọng đọc của trình duyệt; sinh lại bài ôn để thử lại" /> : null}
            {text(item.explanation) ? <p className="small monthly-review-explanation"><strong>{english ? "Explanation" : "Giải thích"}:</strong> {text(item.explanation)}</p> : null}
            {variants.length ? <details className="monthly-review-variant"><summary className="small">{english ? "Question asked again if the learner gets this wrong (same point, new context)" : "Câu hỏi lại khi học viên làm sai (cùng điểm kiến thức, ngữ cảnh khác)"}</summary>{variants.map((variant, variantIndex) => <div className="monthly-review-variant-card" key={text(variant.id) || variantIndex}>
              <OperatorPracticeReview sectionNumber={sectionIndex + 1} headingText={`${heading} · hỏi lại`} part={asPracticePart(section.code, heading, variant, "", english)} />
              {text(variant.explanation) ? <p className="small monthly-review-explanation"><strong>{english ? "Explanation" : "Giải thích"}:</strong> {text(variant.explanation)}</p> : null}
            </div>)}</details> : null}
          </section>;
        })}</ReviewScrollBox>}
      </section>;
    })}
  </>;
}

/** Maps a review item onto the daily practice part shape the exercise card already renders. */
function asPracticePart(sectionCode: string, title: string, item: Item, passage: string, english: boolean): OperatorLessonPart {
  const options = strings(item.options);
  const audioText = text(item.audioText);
  const requiredWords = strings(item.requiredWords);
  if (sectionCode === "speaking" && !options.length) {
    // 6b read aloud: the sentence is the model; 6c free response: required week words.
    const sample = text(item.passage) || (requiredWords.length ? `${english ? "Use at least" : "Dùng ít nhất"} ${typeof item.minRequiredWords === "number" ? item.minRequiredWords : 2} ${english ? "of" : "trong các từ"}: ${requiredWords.join(", ")}` : "");
    return { code: "speaking", title, content: { prompt: text(item.prompt), sample } } as unknown as OperatorLessonPart;
  }
  // Listen-and-choose items (word recognition, minimal pairs) use the listening card with the spoken word as script.
  const code = audioText ? "listening" : sectionCode === "grammar" ? "word_use" : sectionCode === "speaking" ? "listening" : sectionCode;
  return {
    code,
    title,
    content: {
      prompt: text(item.prompt),
      ...(options.length ? { options } : {}),
      ...(text(item.answer) ? { answer: text(item.answer) } : {}),
      ...(audioText ? { script: audioText } : {}),
      ...(code === "reading" ? { text: passage || text(item.passage) } : {})
    }
  } as unknown as OperatorLessonPart;
}

/**
 * A review question's label: the operator (Vietnamese) UI always says "Câu N"; learners read "Question N"
 * from B1 and "Câu N" at A1–A2. Never "Item N".
 */
export function monthlyReviewQuestionLabel(number: number, audience: "operator" | { cefr: string }): string {
  return audience !== "operator" && !["A1", "A2"].includes(audience.cefr) ? `Question ${number}` : `Câu ${number}`;
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []; }

/** Scroll box sized to show exactly `visible` cards (listening 3, other sections 2); the rest scroll inside. */
function ReviewScrollBox({ visible, children }: { visible: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fit = () => {
      const cards = Array.from(box.children) as HTMLElement[];
      if (cards.length <= visible) { box.style.maxHeight = ""; return; }
      const last = cards[visible - 1]!;
      box.style.maxHeight = `${last.offsetTop + last.offsetHeight - cards[0]!.offsetTop + 2}px`;
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(box);
    for (const card of Array.from(box.children)) observer?.observe(card);
    return () => observer?.disconnect();
  }, [visible, children]);
  return <div className="monthly-review-scroll" ref={ref} tabIndex={0}>{children}</div>;
}
