import type { ContentImageView, LessonVocabularyItem } from "@e4s/contracts";
import { Umbrella, Users, Volume2 } from "lucide-react";
import { ContentImage } from "../media/ContentImage.js";

export interface VocabularyRelationChip {
  label: string;
  ariaLabel?: string;
  tone?: "good" | "mid" | "low" | "umb" | "synonym" | "antonym" | "family";
  count?: number;
  icon?: "umbrella" | "family";
  onClick?: () => void;
}

export function VocabularyCard({ item, loadImage, speak, relations = [] }: {
  item: LessonVocabularyItem;
  loadImage: () => Promise<ContentImageView>;
  speak: (text: string) => void;
  relations?: VocabularyRelationChip[];
}) {
  const phrases = (item.collocations ?? item.examples)?.slice(0, 3) ?? [];
  const type = vietnameseWordType(item.type, item.word);
  return <article className="word-card vocabulary-card" aria-label={item.word}>
    <div className="vocabulary-card-heading">
      <ContentImage term={item.word} unavailable="hide" load={loadImage} />
      <div className="vocabulary-card-main">
        <div className="vocabulary-card-word"><h3>{item.word}</h3><span className="vocabulary-card-type">{type}</span>{item.pronunciation ? <span className="ipa vocabulary-card-pronunciation">{item.pronunciation}</span> : null}</div>
        {item.audioUrl ? <audio controls preload="metadata" src={item.audioUrl} aria-label={`Nghe audio từ ${item.word}`} /> : <VocabularySpeechButton text={item.word} label={`Nghe từ ${item.word}`} iconOnly speak={speak} />}
        {item.meaning ? <p className="vocabulary-card-meaning">{item.meaning}</p> : null}
      </div>
    </div>
    {phrases.length ? <div className="vocabulary-card-phrases" aria-label={`${phrases.length} cụm từ thường dùng`}><span className="vocabulary-card-label">Cụm từ thường dùng</span><div className="vocabulary-card-phrase-list">{phrases.map((phrase) => <VocabularySpeechButton text={phrase} label={`Nghe cụm từ: ${phrase}`} visibleLabel={phrase} speak={speak} key={phrase} />)}</div></div> : null}
    {item.examples?.slice(3).map((example, index) => <div className="vocabulary-card-example" key={example}><span className="vocabulary-card-label">Ví dụ</span><VocabularySpeechButton text={example} label={`Nghe ví dụ ${index + 1}: ${example}`} visibleLabel={example} speak={speak} /></div>)}
    {relations.length ? <div className="vocabulary-card-relations" aria-label="Các nhóm từ liên quan">{relations.map((relation) => {
      const className = `chip${relation.tone ? ` ${relation.tone}` : ""}`;
      const content = <>{relation.icon === "umbrella" ? <Umbrella size={14} aria-hidden="true" /> : relation.icon === "family" ? <Users size={14} aria-hidden="true" /> : null}<span className="vocabulary-card-chip-label">{relation.label}</span>{relation.count ? <span className="vocabulary-card-chip-count">+{relation.count}</span> : null}</>;
      return relation.onClick
        ? <button className={className} type="button" title={relation.label} aria-label={relation.ariaLabel ?? (relation.count ? `${relation.label} · ${relation.count} từ` : relation.label)} onClick={relation.onClick} key={relation.ariaLabel ?? relation.label}>{content}</button>
        : <span className={className} key={relation.label}>{content}</span>;
    })}</div> : null}
  </article>;
}

function VocabularySpeechButton({ text, label, visibleLabel, iconOnly = false, speak }: {
  text: string;
  label: string;
  visibleLabel?: string;
  iconOnly?: boolean;
  speak: (text: string) => void;
}) {
  return <button className={`btn-sm btn-ghost vocabulary-card-sound${iconOnly ? " vocabulary-card-sound--icon" : ""}`} type="button" aria-label={label} title={label} onClick={() => speak(text)}><Volume2 size={iconOnly ? 18 : 14} aria-hidden="true" />{iconOnly ? null : visibleLabel}</button>;
}

function vietnameseWordType(value: string | undefined, word: string): string {
  const normalized = value?.trim().toLocaleLowerCase() ?? "";
  const translated: Record<string, string> = {
    noun: "danh từ", verb: "động từ", adjective: "tính từ", adverb: "trạng từ",
    preposition: "giới từ", phrase: "cụm từ", pronoun: "đại từ", conjunction: "liên từ"
  };
  if (translated[normalized]) return translated[normalized]!;
  if (normalized) return value!.trim();
  const known: Record<string, string> = {
    good: "tính từ", bad: "tính từ", fine: "tính từ", clear: "tính từ",
    job: "danh từ", slide: "danh từ", thank: "động từ", check: "động từ",
    send: "động từ", help: "động từ", finish: "động từ"
  };
  return known[word.trim().toLocaleLowerCase()] ?? "từ";
}
