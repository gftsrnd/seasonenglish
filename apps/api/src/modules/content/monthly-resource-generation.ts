import { buildMonthlyCalendar, buildMonthlyCurriculum, type MonthlyCurriculumContract, type SharedMonthBrief } from "@e4s/domain";
import type { CefrLevel } from "@e4s/contracts";
import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { validateMonthlyResourcePlanShape } from "./monthly-resource-plan-spec.js";

export interface MonthlyResourceCriteria {
  vocabularyCount: number;
  expandedVocabularyCount: number;
  grammarTopicCount: number;
  pronunciationSoundCount: number;
}

/**
 * Turns a validated AI resource plan into the same locked monthly contract
 * used by the learner flow.  This is deliberately separate from the old
 * emergency generator below: callers of the normal route must use this path.
 */
export function buildMonthlyResourcesFromAiPlan(
  month: string,
  cefr: CefrLevel,
  theme: SharedMonthBrief,
  criteria: MonthlyResourceCriteria,
  plan: MonthlyResourcePlanTaskOutput
): MonthlyCurriculumContract {
  const calendar = buildMonthlyCalendar(month);
  const newLessonDays = calendar.effectiveDays.flatMap((date, index) => weekday(date) === 5 ? [] : [index + 1]);
  const requiredVocabularyCount = newLessonDays.length * 3;
  const requiredExpandedVocabularyCount = newLessonDays.length * 9;
  if (criteria.vocabularyCount !== requiredVocabularyCount) throw new MonthlyResourceCriteriaError("VOCABULARY_COUNT_MISMATCH", requiredVocabularyCount);
  if (criteria.expandedVocabularyCount < requiredExpandedVocabularyCount) throw new MonthlyResourceCriteriaError("EXPANDED_VOCABULARY_COUNT_TOO_LOW", requiredExpandedVocabularyCount);
  const shapeErrors = validateMonthlyResourcePlanShape(plan, newLessonDays);
  if (plan.grammarTopics.length !== criteria.grammarTopicCount) shapeErrors.push(`Expected ${criteria.grammarTopicCount} grammar topics.`);
  if (plan.pronunciationTargets.length !== criteria.pronunciationSoundCount) shapeErrors.push(`Expected ${criteria.pronunciationSoundCount} pronunciation targets.`);
  // A pronunciation target is reused by its assigned lessons.  Three reliable
  // words per target are enough for each daily lesson; requiring a fresh set
  // for every assigned day forces needless duplication in the monthly plan.
  if (plan.pronunciationTargets.some((target) => target.words.length < 3)) shapeErrors.push("A pronunciation target needs at least three words.");
  if (shapeErrors.length) throw new MonthlyResourcePlanError(shapeErrors);

  // The domain assigns core terms to new lesson days in chronological order.
  // Validate the model supplied exactly that grouping before preserving it.
  const expectedByDay = new Map(newLessonDays.map((day) => [day, 3]));
  for (const core of plan.coreTerms) {
    if ((expectedByDay.get(core.dayNumber) ?? 0) <= 0) throw new MonthlyResourcePlanError([`Invalid core day assignment ${core.dayNumber}.`]);
    expectedByDay.set(core.dayNumber, (expectedByDay.get(core.dayNumber) ?? 0) - 1);
  }
  if ([...expectedByDay.values()].some((remaining) => remaining !== 0)) throw new MonthlyResourcePlanError(["Core day assignments are incomplete."]);

  const coreTerms = [...plan.coreTerms]
    .sort((a, b) => a.dayNumber - b.dayNumber || a.word.localeCompare(b.word))
    .map(({ word, meaning, type, ipa }, index) => ({ id: `${cefr.toLowerCase()}-core-${index + 1}`, word, meaning, type, ipa }));
  const supportTerms = [...plan.expandedTerms].sort((a, b) => a.dayNumber - b.dayNumber || a.word.localeCompare(b.word)).map((term, index) => ({
    id: `${cefr.toLowerCase()}-expanded-${index + 1}`, word: term.word, meaning: term.meaning, type: term.type,
    source: relationSource(term.relation), dayNumber: term.dayNumber
  }));
  const grammarTopics = plan.grammarTopics.map((topic, index) => ({
    id: `${cefr.toLowerCase()}-grammar-${index + 1}`, title: topic.title,
    steps: [{ id: `${cefr.toLowerCase()}-grammar-${index + 1}-step`, focus: topic.title, formula: topic.formula, usage: topic.usage, examples: topic.examples }]
  }));
  const sounds = plan.pronunciationTargets.map((target, targetIndex) => ({
    id: `${cefr.toLowerCase()}-sound-${targetIndex + 1}`, ipa: target.ipa, label: `${target.label}: ${target.explanation}`,
    examples: target.words.map((word, index) => ({ id: `${cefr.toLowerCase()}-sound-${targetIndex + 1}-word-${index + 1}`, word: word.word, ipa: word.ipa }))
  }));
  return buildMonthlyCurriculum({ month, cefr, theme, coreTerms, supportTerms, grammarTopics, sounds });
}

export class MonthlyResourcePlanError extends Error {
  constructor(readonly errors: readonly string[]) {
    super("MONTHLY_RESOURCE_PLAN_INVALID");
  }
}

function relationSource(relation: MonthlyResourcePlanTaskOutput["expandedTerms"][number]["relation"]): "example" | "family" | "synonym" | "antonym" | "group" {
  if (relation === "word_family") return "family";
  if (relation === "collocation") return "example";
  if (relation === "umbrella") return "group";
  return relation;
}

/**
 * Creates a complete, valid monthly resource set when an AI provider is not
 * available. The generated text is deliberately neutral: operators can review
 * and replace it before they approve the resources.
 */
export function generateMonthlyResources(
  month: string,
  cefr: CefrLevel,
  theme: SharedMonthBrief,
  criteria: MonthlyResourceCriteria
): MonthlyCurriculumContract {
  const calendar = buildMonthlyCalendar(month);
  const newLessonCount = calendar.effectiveDays.filter((date) => weekday(date) !== 5).length;
  const requiredVocabularyCount = newLessonCount * 3;
  if (criteria.vocabularyCount !== requiredVocabularyCount) {
    throw new MonthlyResourceCriteriaError("VOCABULARY_COUNT_MISMATCH", requiredVocabularyCount);
  }
  const requiredExpandedVocabularyCount = newLessonCount * 9;
  if (criteria.expandedVocabularyCount < requiredExpandedVocabularyCount) {
    throw new MonthlyResourceCriteriaError("EXPANDED_VOCABULARY_COUNT_TOO_LOW", requiredExpandedVocabularyCount);
  }

  const levelPlan = CEFR_RESOURCE_PLANS[cefr];
  const coreTerms = Array.from({ length: requiredVocabularyCount }, (_, index) => {
    const [word, meaning, type, ipa] = levelPlan.terms[index % levelPlan.terms.length]!;
    const cycle = Math.floor(index / levelPlan.terms.length);
    return {
    id: `${cefr.toLowerCase()}-term-${index + 1}`,
    word: cycle ? `${word} ${cycle + 1}` : word,
    meaning,
    type,
    ipa
    };
  });
  const newDayNumbers = calendar.effectiveDays.map((date, index) => ({ date, dayNumber: index + 1 })).filter(({ date }) => weekday(date) !== 5).map(({ dayNumber }) => dayNumber);
  const supportTerms = newDayNumbers.flatMap((dayNumber, dayIndex) => {
    const terms = coreTerms.slice(dayIndex * 3, dayIndex * 3 + 3);
    return RELATION_PATTERNS.map((pattern, relationIndex) => {
      const term = terms[relationIndex % terms.length]!;
      return {
        id: `${cefr.toLowerCase()}-extra-${dayIndex * 9 + relationIndex + 1}`,
        word: pattern.word(term.word), meaning: pattern.meaning(term.meaning), type: "phrase", ipa: term.ipa,
        source: pattern.source, dayNumber
      };
    });
  }).slice(0, criteria.expandedVocabularyCount);
  const grammarTopics = Array.from({ length: criteria.grammarTopicCount }, (_, index) => {
    const plan = levelPlan.grammar[index % levelPlan.grammar.length]!;
    return {
    id: `${cefr.toLowerCase()}-grammar-${index + 1}`,
    title: plan.title,
    steps: [{
      id: `${cefr.toLowerCase()}-grammar-${index + 1}-step-1`,
      focus: plan.focus,
      formula: plan.formula,
      usage: plan.usage,
      examples: [...plan.examples]
    }]
    };
  });
  const examplesPerSound = Math.ceil(calendar.lessonCount / criteria.pronunciationSoundCount) * 3;
  const sounds = Array.from({ length: criteria.pronunciationSoundCount }, (_, index) => {
    const plan = levelPlan.sounds[index % levelPlan.sounds.length]!;
    return {
    id: `${cefr.toLowerCase()}-sound-${index + 1}`,
    ipa: plan.ipa,
    label: plan.label,
    examples: Array.from({ length: examplesPerSound }, (_, exampleIndex) => ({
      id: `${cefr.toLowerCase()}-sound-${index + 1}-example-${exampleIndex + 1}`,
      ...plan.examples[exampleIndex % plan.examples.length]!
    }))
    };
  });

  return buildMonthlyCurriculum({ month, cefr, theme, coreTerms, supportTerms, grammarTopics, sounds });
}

export class MonthlyResourceCriteriaError extends Error {
  constructor(readonly code: "VOCABULARY_COUNT_MISMATCH" | "EXPANDED_VOCABULARY_COUNT_TOO_LOW", readonly requiredVocabularyCount: number) {
    super(code);
  }
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

const WORKPLACE_TERMS = [
  ["agenda", "chương trình họp", "noun", "/ˈædʒəndə/"], ["client", "khách hàng", "noun", "/ˈklaɪənt/"], ["feedback", "phản hồi", "noun", "/ˈfiːdbæk/"],
  ["meeting", "cuộc họp", "noun", "/ˈmiːtɪŋ/"], ["project", "dự án", "noun", "/ˈprɒdʒekt/"], ["progress", "tiến độ", "noun", "/ˈprəʊɡres/"],
  ["update", "cập nhật", "noun", "/ʌpˈdeɪt/"], ["concern", "mối quan ngại", "noun", "/kənˈsɜːn/"], ["request", "yêu cầu", "noun", "/rɪˈkwest/"],
  ["response", "phản hồi", "noun", "/rɪˈspɒns/"], ["deadline", "hạn chót", "noun", "/ˈdedlaɪn/"], ["timeline", "mốc thời gian", "noun", "/ˈtaɪmlaɪn/"],
  ["task", "nhiệm vụ", "noun", "/tɑːsk/"], ["action item", "việc cần làm", "noun", "/ˈækʃn ˌaɪtəm/"], ["follow-up", "việc theo dõi", "noun", "/ˈfɒləʊ ʌp/"],
  ["clarify", "làm rõ", "verb", "/ˈklærəfaɪ/"], ["confirm", "xác nhận", "verb", "/kənˈfɜːm/"], ["agree", "đồng ý", "verb", "/əˈɡriː/"],
  ["suggest", "đề xuất", "verb", "/səˈdʒest/"], ["discuss", "thảo luận", "verb", "/dɪˈskʌs/"], ["explain", "giải thích", "verb", "/ɪkˈspleɪn/"],
  ["listen", "lắng nghe", "verb", "/ˈlɪsn/"], ["note", "ghi chú", "verb", "/nəʊt/"], ["summarize", "tóm tắt", "verb", "/ˈsʌməraɪz/"],
  ["email", "thư điện tử", "noun", "/ˈiːmeɪl/"], ["message", "tin nhắn", "noun", "/ˈmesɪdʒ/"], ["stakeholder", "bên liên quan", "noun", "/ˈsteɪkhəʊldə(r)/"],
  ["requirement", "yêu cầu", "noun", "/rɪˈkwaɪəmənt/"], ["change", "thay đổi", "noun", "/tʃeɪndʒ/"], ["priority", "ưu tiên", "noun", "/praɪˈɒrəti/"],
  ["solution", "giải pháp", "noun", "/səˈluːʃn/"], ["issue", "vấn đề", "noun", "/ˈɪʃuː/"], ["risk", "rủi ro", "noun", "/rɪsk/"],
  ["scope", "phạm vi", "noun", "/skəʊp/"], ["status", "trạng thái", "noun", "/ˈsteɪtəs/"], ["review", "xem xét", "noun", "/rɪˈvjuː/"],
  ["decision", "quyết định", "noun", "/dɪˈsɪʒn/"], ["question", "câu hỏi", "noun", "/ˈkwestʃən/"], ["comment", "nhận xét", "noun", "/ˈkɒment/"],
  ["improve", "cải thiện", "verb", "/ɪmˈpruːv/"], ["resolve", "giải quyết", "verb", "/rɪˈzɒlv/"], ["delay", "trì hoãn", "noun", "/dɪˈleɪ/"],
  ["plan", "kế hoạch", "noun", "/plæn/"], ["report", "báo cáo", "noun", "/rɪˈpɔːt/"], ["team", "nhóm", "noun", "/tiːm/"], ["manager", "quản lý", "noun", "/ˈmænɪdʒə(r)/"],
  ["deliverable", "sản phẩm bàn giao", "noun", "/dɪˈlɪvərəbl/"], ["approval", "sự phê duyệt", "noun", "/əˈpruːvl/"]
] as const;

const RELATION_PATTERNS = [
  { source: "group" as const, word: (word: string) => `workplace ${word}`, meaning: (meaning: string) => `nhóm từ về ${meaning}` },
  { source: "group" as const, word: (word: string) => `client ${word}`, meaning: (meaning: string) => `ngữ cảnh khách hàng: ${meaning}` },
  { source: "group" as const, word: (word: string) => `project ${word}`, meaning: (meaning: string) => `ngữ cảnh dự án: ${meaning}` },
  { source: "synonym" as const, word: (word: string) => `related to ${word}`, meaning: (meaning: string) => `từ gần nghĩa với ${meaning}` },
  { source: "antonym" as const, word: (word: string) => `opposite of ${word}`, meaning: (meaning: string) => `từ trái nghĩa với ${meaning}` },
  { source: "synonym" as const, word: (word: string) => `alternative to ${word}`, meaning: (meaning: string) => `cách diễn đạt tương tự ${meaning}` },
  { source: "antonym" as const, word: (word: string) => `without ${word}`, meaning: (meaning: string) => `trạng thái không có ${meaning}` },
  { source: "family" as const, word: (word: string) => `${word} related`, meaning: (meaning: string) => `họ từ của ${meaning}` },
  { source: "family" as const, word: (word: string) => `${word} process`, meaning: (meaning: string) => `từ cùng họ với ${meaning}` }
] as const;

const GRAMMAR_PLANS = [
  { title: "Cập nhật tiến độ", focus: "Nói việc đang diễn ra", formula: "I am + verb-ing", usage: "Dùng để cập nhật việc đang thực hiện trong buổi họp.", examples: ["I am reviewing the client feedback.", "We are updating the timeline."] },
  { title: "Làm rõ yêu cầu", focus: "Đặt câu hỏi lịch sự", formula: "Could you + base verb + ...?", usage: "Dùng để hỏi lại khi cần làm rõ yêu cầu hoặc phản hồi.", examples: ["Could you clarify this request?", "Could you confirm the deadline?"] },
  { title: "Đề xuất phương án", focus: "Nêu đề xuất", formula: "I suggest + noun / verb-ing", usage: "Dùng để đưa ra một phương án trong cuộc họp.", examples: ["I suggest a short follow-up meeting.", "I suggest reviewing the scope."] },
  { title: "Chốt việc cần làm", focus: "Xác nhận bước tiếp theo", formula: "Let’s + base verb", usage: "Dùng để thống nhất hành động sau cuộc họp.", examples: ["Let’s confirm the action items.", "Let’s send an update today."] }
] as const;

const SOUND_PLANS = [
  { ipa: "/iː/", label: "Âm /iː/ trong từ về cuộc họp", examples: ["meet", "team", "please", "receive", "leave", "need", "week", "keep", "read", "detail", "complete", "agree", "meeting", "feedback", "email"].map((word) => ({ word, ipa: `/` + (word === "feedback" ? "ˈfiːdbæk" : word === "email" ? "ˈiːmeɪl" : `iː`) + `/` })) },
  { ipa: "/ɪ/", label: "Âm /ɪ/ trong từ về dự án", examples: ["risk", "list", "issue", "fix", "quick", "limit", "simple", "finish", "visit", "minute", "client", "switch", "within", "written", "decision"].map((word) => ({ word, ipa: "/ɪ/" })) },
  { ipa: "/θ/", label: "Âm /θ/ trong từ về trao đổi", examples: ["thank", "think", "three", "through", "Thursday", "method", "author", "health", "month", "both", "north", "growth", "with", "path", "length"].map((word) => ({ word, ipa: "/θ/" })) },
  { ipa: "/s/", label: "Âm /s/ trong từ về trạng thái", examples: ["status", "scope", "solution", "suggest", "summary", "process", "response", "request", "discuss", "message", "risk", "issue", "progress", "task", "client"].map((word) => ({ word, ipa: "/s/" })) }
] as const;

const A2_TERMS = [
  ["arrange", "sắp xếp", "verb", "/əˈreɪndʒ/"], ["attend", "tham dự", "verb", "/əˈtend/"], ["brief", "tóm tắt ngắn", "noun", "/briːf/"],
  ["collaborate", "hợp tác", "verb", "/kəˈlæbəreɪt/"], ["coordinate", "phối hợp", "verb", "/kəʊˈɔːdɪneɪt/"], ["deliver", "bàn giao", "verb", "/dɪˈlɪvə(r)/"],
  ["evaluate", "đánh giá", "verb", "/ɪˈvæljueɪt/"], ["negotiate", "đàm phán", "verb", "/nɪˈɡəʊʃieɪt/"], ["participate", "tham gia", "verb", "/pɑːˈtɪsɪpeɪt/"],
  ["propose", "đề xuất", "verb", "/prəˈpəʊz/"], ["schedule", "lịch trình", "noun", "/ˈʃedjuːl/"], ["solve", "giải quyết", "verb", "/sɒlv/"],
  ["support", "hỗ trợ", "verb", "/səˈpɔːt/"], ["track", "theo dõi", "verb", "/træk/"], ["transfer", "chuyển giao", "verb", "/trænsˈfɜː(r)/"],
  ["volunteer", "tình nguyện", "verb", "/ˌvɒlənˈtɪə(r)/"], ["attachment", "tệp đính kèm", "noun", "/əˈtætʃmənt/"], ["budget", "ngân sách", "noun", "/ˈbʌdʒɪt/"],
  ["colleague", "đồng nghiệp", "noun", "/ˈkɒliːɡ/"], ["document", "tài liệu", "noun", "/ˈdɒkjumənt/"], ["event", "sự kiện", "noun", "/ɪˈvent/"],
  ["file", "tệp", "noun", "/faɪl/"], ["form", "biểu mẫu", "noun", "/fɔːm/"], ["guideline", "hướng dẫn", "noun", "/ˈɡaɪdlaɪn/"],
  ["handover", "bàn giao", "noun", "/ˈhændəʊvə(r)/"], ["location", "địa điểm", "noun", "/ləʊˈkeɪʃn/"], ["milestone", "mốc quan trọng", "noun", "/ˈmaɪlstəʊn/"],
  ["outcome", "kết quả", "noun", "/ˈaʊtkʌm/"], ["participant", "người tham gia", "noun", "/pɑːˈtɪsɪpənt/"], ["presentation", "bài trình bày", "noun", "/ˌpreznˈteɪʃn/"],
  ["procedure", "quy trình", "noun", "/prəˈsiːdʒə(r)/"], ["product", "sản phẩm", "noun", "/ˈprɒdʌkt/"], ["purpose", "mục đích", "noun", "/ˈpɜːpəs/"],
  ["resource", "nguồn lực", "noun", "/rɪˈsɔːs/"], ["session", "phiên họp", "noun", "/ˈseʃn/"], ["training", "đào tạo", "noun", "/ˈtreɪnɪŋ/"],
  ["visitor", "khách đến", "noun", "/ˈvɪzɪtə(r)/"], ["availability", "khả năng sẵn sàng", "noun", "/əˌveɪləˈbɪləti/"], ["flexibility", "tính linh hoạt", "noun", "/ˌfleksəˈbɪləti/"],
  ["efficiency", "hiệu quả", "noun", "/ɪˈfɪʃnsi/"], ["urgent", "khẩn cấp", "adjective", "/ˈɜːdʒənt/"], ["useful", "hữu ích", "adjective", "/ˈjuːsfl/"],
  ["reliable", "đáng tin cậy", "adjective", "/rɪˈlaɪəbl/"], ["detailed", "chi tiết", "adjective", "/ˈdiːteɪld/"], ["professional", "chuyên nghiệp", "adjective", "/prəˈfeʃənl/"],
  ["productive", "năng suất", "adjective", "/prəˈdʌktɪv/"]
] as const;

const A2_GRAMMAR_PLANS = [
  { title: "Báo cáo công việc đã hoàn thành", focus: "Dùng hiện tại hoàn thành", formula: "I have + past participle", usage: "Dùng để nêu việc đã hoàn tất và kết quả liên quan.", examples: ["I have completed the handover document.", "We have arranged the training session."] },
  { title: "Đề xuất có điều kiện", focus: "Nêu phương án kèm lý do", formula: "If + present simple, ... will + base verb", usage: "Dùng để nói về kết quả dự kiến của một lựa chọn.", examples: ["If we move the session, more people will attend.", "If the file is ready, I will transfer it today."] },
  { title: "Phân công công việc", focus: "Dùng bị động", formula: "Subject + be + past participle", usage: "Dùng để mô tả việc được giao hoặc được hoàn tất.", examples: ["The presentation is shared with all participants.", "The budget was reviewed this morning."] },
  { title: "Đàm phán lịch trình", focus: "Dùng so sánh", formula: "... is more + adjective + than ...", usage: "Dùng để so sánh các phương án trong khi lập kế hoạch.", examples: ["Tuesday is more convenient than Thursday.", "This option is more flexible than the first plan."] }
] as const;

const A2_SOUND_PLANS = [
  { ipa: "/eɪ/", label: "Âm /eɪ/ trong từ về sắp xếp", examples: ["arrange", "training", "presentation", "available", "date", "plan", "change", "take", "make", "stage", "late", "same", "case", "place", "wait"].map((word) => ({ word, ipa: "/eɪ/" })) },
  { ipa: "/əʊ/", label: "Âm /əʊ/ trong từ về phối hợp", examples: ["coordinate", "propose", "location", "handover", "note", "goal", "scope", "show", "follow", "role", "open", "close", "know", "phone", "process"].map((word) => ({ word, ipa: "/əʊ/" })) },
  { ipa: "/ʃ/", label: "Âm /ʃ/ trong từ về thủ tục", examples: ["schedule", "session", "share", "short", "finish", "issue", "ensure", "special", "station", "discussion", "professional", "machine", "action", "information", "question"].map((word) => ({ word, ipa: "/ʃ/" })) },
  { ipa: "/dʒ/", label: "Âm /dʒ/ trong từ về ngân sách", examples: ["budget", "urgent", "project", "adjust", "schedule", "manage", "major", "join", "job", "change", "page", "bridge", "message", "procedure", "suggest"].map((word) => ({ word, ipa: "/dʒ/" })) }
] as const;

const CEFR_RESOURCE_PLANS = {
  A1: { terms: WORKPLACE_TERMS, grammar: GRAMMAR_PLANS, sounds: SOUND_PLANS },
  A2: { terms: A2_TERMS, grammar: A2_GRAMMAR_PLANS, sounds: A2_SOUND_PLANS },
  B1: { terms: A2_TERMS, grammar: A2_GRAMMAR_PLANS, sounds: A2_SOUND_PLANS },
  B2: { terms: A2_TERMS, grammar: A2_GRAMMAR_PLANS, sounds: A2_SOUND_PLANS },
  C1: { terms: A2_TERMS, grammar: A2_GRAMMAR_PLANS, sounds: A2_SOUND_PLANS }
} as const;
