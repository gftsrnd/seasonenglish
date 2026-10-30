import type { ContentImageView, LessonVocabularyItem } from "@e4s/contracts";
import { Umbrella, Users, Volume2 } from "lucide-react";
import { ContentImage } from "../media/ContentImage.js";
import { learnerLessonCopy, type LearnerLessonLanguage } from "./language.js";
import { playExclusiveMedia } from "../../../features/experience/audio-precedence.js";

export interface VocabularyRelationChip {
  label: string;
  ariaLabel?: string;
  tone?: "good" | "mid" | "low" | "umb" | "synonym" | "antonym" | "family";
  count?: number;
  icon?: "umbrella" | "family";
  onClick?: (() => void) | undefined;
}
export function VocabularyCard({ item, loadImage, speak, relations = [], language = "vi" }: {
  item: LessonVocabularyItem;
  loadImage: () => Promise<ContentImageView>;
  speak: (text: string) => void;
  relations?: VocabularyRelationChip[];
  language?: LearnerLessonLanguage;
}) {
  const phrases = (item.collocations ?? item.examples)?.slice(0, 3) ?? [];
  const phraseAudioUrls = item.collocationAudioUrls ?? item.exampleAudioUrls ?? [];
  const copy = learnerLessonCopy[language];
  const type = copy.vocabularyPartOfSpeech(item.type, item.word);
  return <article className="word-card vocabulary-card" aria-label={item.word}>
    <div className="vocabulary-card-heading">
      <ContentImage term={item.word} unavailable="hide" load={loadImage} />
      <div className="vocabulary-card-main">
        <div className="vocabulary-card-word"><h3>{item.word}</h3><span className="vocabulary-card-type">{type}</span>{item.pronunciation ? <span className="ipa vocabulary-card-pronunciation">{item.pronunciation}</span> : null}</div>
        {item.audioUrl ? <VocabularyAudioButton src={item.audioUrl} label={`Nghe từ ${item.word}`} fallback={() => speak(item.word)} /> : <VocabularySpeechButton text={item.word} label={`Nghe từ ${item.word}`} iconOnly speak={speak} />}
        {item.meaning ? <p className="vocabulary-card-meaning">{item.meaning}</p> : null}
      </div>
    </div>
    {phrases.length ? <div className="vocabulary-card-phrases" aria-label={`${phrases.length} ${copy.vocabulary.collocations.toLocaleLowerCase()}`}><span className="vocabulary-card-label">{copy.vocabulary.collocations}</span><div className="vocabulary-card-phrase-list">{phrases.map((phrase, index) => { const phraseLabel = language === "vi" ? `Nghe cụm từ: ${phrase}` : `Listen to common collocation: ${phrase}`; return phraseAudioUrls[index] ? <VocabularyAudioButton src={phraseAudioUrls[index]!} label={phraseLabel} visibleLabel={phrase} fallback={() => speak(phrase)} key={phrase} /> : <VocabularySpeechButton text={phrase} label={phraseLabel} visibleLabel={phrase} speak={speak} key={phrase} />; })}</div></div> : null}
    {item.examples?.slice(3).map((example, index) => item.exampleAudioUrls?.[index + 3] ? <div className="vocabulary-card-example" key={example}><span className="vocabulary-card-label">{copy.vocabulary.examples}</span><VocabularyAudioButton src={item.exampleAudioUrls[index + 3]!} label={`${copy.modal.listen} ${copy.vocabulary.examples.toLocaleLowerCase()} ${index + 1}: ${example}`} visibleLabel={example} fallback={() => speak(example)} /></div> : <div className="vocabulary-card-example" key={example}><span className="vocabulary-card-label">{copy.vocabulary.examples}</span><VocabularySpeechButton text={example} label={`${copy.modal.listen} ${copy.vocabulary.examples.toLocaleLowerCase()} ${index + 1}: ${example}`} visibleLabel={example} speak={speak} /></div>)}
    {relations.length ? <div className="vocabulary-card-relations" aria-label={copy.vocabulary.relations}>{relations.map((relation) => {
      const className = `chip${relation.tone ? ` ${relation.tone}` : ""}`;
      const content = <>{relation.icon === "umbrella" ? <Umbrella size={14} aria-hidden="true" /> : relation.icon === "family" ? <Users size={14} aria-hidden="true" /> : null}<span className="vocabulary-card-chip-label">{relation.label}</span>{relation.count ? <span className="vocabulary-card-chip-count">+{relation.count}</span> : null}</>;
      return relation.onClick
        ? <button className={className} type="button" title={relation.label} aria-label={relation.ariaLabel ?? (relation.count ? `${relation.label} · ${relation.count} từ` : relation.label)} onClick={relation.onClick} key={relation.ariaLabel ?? relation.label}>{content}</button>
        : <span className={className} key={relation.label}>{content}</span>;
    })}</div> : null}
  </article>;
}
function VocabularyAudioButton({ src, label, visibleLabel, fallback }: {
  src: string;
  label: string;
  visibleLabel?: string;
  fallback: () => void;
}) {
  const play = () => {
    playExclusiveMedia(src, fallback);
  };
  return <button className={`btn-sm btn-ghost vocabulary-card-sound${visibleLabel ? "" : " vocabulary-card-sound--icon"}`} type="button" aria-label={label} title={label} onClick={play}><Volume2 size={visibleLabel ? 14 : 18} aria-hidden="true" />{visibleLabel}</button>;
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
