/**
 * Khung tháng (month framework) và cách chia khung thành bài ngày.
 * Luật thuần: không gọi DB, không gọi AI. API/worker chỉ gọi vào đây.
 */
import type { CefrLevel, LessonPart } from "@e4s/contracts";
import { DEFAULT_MONTH_FRAMEWORK_SETTINGS, type MonthFrameworkSettings } from "./index.js";

export interface FrameworkVocabularyItem {
  word: string;
  type: string;
  ipa: string;
  meaning: string;
  example: string;
  /** Từ trừu tượng: ẩn khung ảnh, chỉ nhận ảnh Vận hành tải tay. */
  abstract: boolean;
}

export interface FrameworkGrammarStep {
  step: number;
  focus: string;
  formula: string;
  usage: string;
  examples: string[];
}

export interface FrameworkGrammarTopic {
  title: string;
  summary: string;
  /** Chuỗi scaffolding: bài sau xây trên bài trước. */
  steps: FrameworkGrammarStep[];
}

export interface FrameworkSound {
  /** IPA không có dấu gạch chéo, phải thuộc inventory hỗ trợ (ví dụ "iː", "θ"). */
  ipa: string;
  label: string;
  tip: string;
  /** Mẹo bằng tiếng Anh cho B1+ (nội dung learner-facing B1+ phải là tiếng Anh). */
  tipEn?: string;
  /** Kho ví dụ theo level; mỗi ngày lấy 3 từ chưa dùng trong tháng. */
  examples: Array<{ word: string; ipa: string }>;
}

export interface MonthFramework {
  cefr: CefrLevel;
  vocabulary: FrameworkVocabularyItem[];
  grammarTopics: FrameworkGrammarTopic[];
  sounds: FrameworkSound[];
}

export interface DayPlan {
  lessonNumber: number;
  /** Chỉ số (0-based) vào framework.vocabulary. Bài ôn thì `review = true`. */
  vocabulary: Array<{ index: number; review: boolean }>;
  grammar: { topicIndex: number; stepIndex: number };
  pronunciation: { soundIndex: number; exampleIndices: number[] };
}

export interface DistributionPlan {
  lessonCount: number;
  days: DayPlan[];
  /** Bài đầu tiên chỉ ôn từ (hết từ mới). Null nếu từ mới đủ cho cả tháng. */
  firstReviewLesson: number | null;
}

export const WORDS_PER_LESSON = 3;
export const PRONUNCIATION_WORDS_PER_LESSON = 3;

export function validateMonthFramework(framework: MonthFramework, settings: MonthFrameworkSettings, lessonCount: number): string[] {
  const errors: string[] = [];
  if (framework.vocabulary.length !== settings.vocabularyCount) errors.push(`Khung cần đúng ${settings.vocabularyCount} từ vựng, hiện có ${framework.vocabulary.length}.`);
  if (framework.grammarTopics.length !== settings.grammarTopicCount) errors.push(`Khung cần đúng ${settings.grammarTopicCount} chủ điểm ngữ pháp, hiện có ${framework.grammarTopics.length}.`);
  if (framework.sounds.length !== settings.soundCount) errors.push(`Khung cần đúng ${settings.soundCount} âm, hiện có ${framework.sounds.length}.`);
  const words = new Set<string>();
  for (const item of framework.vocabulary) {
    const key = item.word.trim().toLowerCase();
    if (!key) errors.push("Có từ vựng rỗng.");
    else if (words.has(key)) errors.push(`Từ "${item.word}" bị lặp trong khung.`);
    words.add(key);
  }
  framework.grammarTopics.forEach((topic, index) => {
    if (topic.steps.length === 0) errors.push(`Chủ điểm ngữ pháp ${index + 1} chưa có bước scaffolding.`);
  });
  const neededExamples = Math.ceil(lessonCount / Math.max(1, framework.sounds.length)) * PRONUNCIATION_WORDS_PER_LESSON;
  framework.sounds.forEach((sound, index) => {
    const unique = new Set(sound.examples.map((example) => example.word.trim().toLowerCase()));
    if (unique.size < neededExamples) errors.push(`Âm ${index + 1} (/${sound.ipa}/) cần ít nhất ${neededExamples} ví dụ khác nhau để không trùng trong tháng, hiện có ${unique.size}.`);
  });
  return errors;
}

/**
 * Chia khung thành `lessonCount` bài:
 * - Từ vựng: 3 từ/ngày theo thứ tự; hết từ mới thì ôn từ đã học lâu nhất.
 * - Ngữ pháp: Y chủ điểm, mỗi chủ điểm chiếm một đoạn liên tiếp của tháng; trong đoạn, các bước scaffolding
 *   trải đều theo thứ tự (bài sau xây trên bài trước).
 * - Phát âm: Z âm xoay vòng; mỗi ngày 3 ví dụ chưa dùng trong tháng của âm đó.
 */
export function distributeFramework(framework: MonthFramework, lessonCount: number): DistributionPlan {
  if (lessonCount <= 0) throw new RangeError("lessonCount must be positive");
  const days: DayPlan[] = [];
  const vocabularyTotal = framework.vocabulary.length;
  const lastTaught = new Map<number, number>();
  let cursor = 0;
  let firstReviewLesson: number | null = null;
  const usedExamples = framework.sounds.map(() => 0);

  for (let lessonNumber = 1; lessonNumber <= lessonCount; lessonNumber += 1) {
    const vocabulary: DayPlan["vocabulary"] = [];
    for (let slot = 0; slot < WORDS_PER_LESSON; slot += 1) {
      if (cursor < vocabularyTotal) {
        vocabulary.push({ index: cursor, review: false });
        lastTaught.set(cursor, lessonNumber);
        cursor += 1;
      } else if (vocabularyTotal > 0) {
        if (firstReviewLesson === null) firstReviewLesson = lessonNumber;
        const chosen = vocabulary.map((item) => item.index);
        const oldest = [...lastTaught.entries()]
          .filter(([index]) => !chosen.includes(index))
          .sort((left, right) => left[1] - right[1] || left[0] - right[0])[0];
        if (!oldest) break;
        vocabulary.push({ index: oldest[0], review: true });
        lastTaught.set(oldest[0], lessonNumber);
      }
    }

    const grammar = grammarSlot(framework.grammarTopics, lessonNumber, lessonCount);

    const soundIndex = framework.sounds.length ? (lessonNumber - 1) % framework.sounds.length : 0;
    const sound = framework.sounds[soundIndex];
    const exampleIndices: number[] = [];
    if (sound) {
      for (let slot = 0; slot < PRONUNCIATION_WORDS_PER_LESSON; slot += 1) {
        const next = usedExamples[soundIndex]!;
        if (next >= sound.examples.length) break;
        exampleIndices.push(next);
        usedExamples[soundIndex] = next + 1;
      }
    }

    days.push({ lessonNumber, vocabulary, grammar, pronunciation: { soundIndex, exampleIndices } });
  }
  return { lessonCount, days, firstReviewLesson };
}

function grammarSlot(topics: FrameworkGrammarTopic[], lessonNumber: number, lessonCount: number): DayPlan["grammar"] {
  if (topics.length === 0) return { topicIndex: 0, stepIndex: 0 };
  const perTopic = lessonCount / topics.length;
  const topicIndex = Math.min(topics.length - 1, Math.floor((lessonNumber - 1) / perTopic));
  const topicStart = Math.floor(topicIndex * perTopic);
  const topicEnd = topicIndex === topics.length - 1 ? lessonCount : Math.floor((topicIndex + 1) * perTopic);
  const span = Math.max(1, topicEnd - topicStart);
  const steps = Math.max(1, topics[topicIndex]!.steps.length);
  const position = lessonNumber - 1 - topicStart;
  const stepIndex = Math.min(steps - 1, Math.floor((position * steps) / span));
  return { topicIndex, stepIndex };
}

export interface BuiltLesson {
  dayNumber: number;
  title: string;
  durationMinutes: number;
  parts: LessonPart[];
}

/**
 * Dựng nội dung bài ngày từ kế hoạch chia. Dùng cho khung mẫu (không AI) và làm nền khi AI chưa làm giàu.
 * Phần bài tập (nghe/đọc/viết/từ loại/dùng từ/nói) được dựng theo mẫu từ chính từ vựng và ngữ pháp của ngày.
 */
export function buildLessonFromDayPlan(framework: MonthFramework, plan: DayPlan): BuiltLesson {
  const vietnamese = framework.cefr === "A1" || framework.cefr === "A2";
  const words = plan.vocabulary.map((slot) => ({ ...framework.vocabulary[slot.index]!, review: slot.review }));
  const topic = framework.grammarTopics[plan.grammar.topicIndex];
  const step = topic?.steps[plan.grammar.stepIndex];
  const sound = framework.sounds[plan.pronunciation.soundIndex];
  const examples = plan.pronunciation.exampleIndices.map((index) => sound?.examples[index]).filter((item): item is { word: string; ipa: string } => Boolean(item));
  const first = words[0];
  const reviewCount = words.filter((word) => word.review).length;
  const title = `${vietnamese ? "Bài" : "Lesson"} ${plan.lessonNumber}: ${topic?.title ?? (vietnamese ? "Ôn tập" : "Review")} · ${step?.focus ?? ""}`.replace(/ · $/u, "");
  const tip = vietnamese ? sound?.tip ?? "" : sound?.tipEn ?? sound?.tip ?? "";
  const objectiveText = vietnamese
    ? `Dùng được ${words.map((word) => word.word).join(", ")}${reviewCount ? ` (ôn ${reviewCount} từ)` : ""} và mẫu "${step?.formula ?? ""}" trong công việc.`
    : `Use ${words.map((word) => word.word).join(", ")}${reviewCount ? ` (reviewing ${reviewCount})` : ""} with the pattern "${step?.formula ?? ""}" at work.`;
  const sentence = first?.example ?? "I work with my team.";
  const wrongOptions = (correct: string, pool: string[]) => {
    const options = [correct];
    for (const candidate of pool) if (options.length < 4 && !options.includes(candidate)) options.push(candidate);
    const filler = ["every day", "next week", "very good", "in the office"];
    for (const candidate of filler) if (options.length < 4 && !options.includes(candidate)) options.push(candidate);
    return options;
  };
  const parts: LessonPart[] = [
    { code: "objective", title: vietnamese ? "Mục tiêu bài học" : "Learning objectives", content: { text: objectiveText } },
    { code: "instruction", title: vietnamese ? "Hướng dẫn làm bài" : "Lesson instructions", content: { steps: vietnamese ? ["Học 3 thẻ từ vựng", "Đọc ngữ pháp và ví dụ", "Nghe âm chính và 3 từ mẫu", "Làm lần lượt các bài tập"] : ["Study the 3 vocabulary cards", "Read the grammar pattern and examples", "Listen to the target sound and 3 model words", "Complete the exercises in order"] } },
    { code: "vocabulary", title: vietnamese ? "Từ vựng" : "Vocabulary", content: { items: words.map((word) => ({ word: word.word, type: word.type, pronunciation: word.ipa, meaning: word.meaning, examples: [word.example], ...(word.abstract ? { abstract: true } : {}), ...(word.review ? { review: true } : {}) })) } },
    { code: "grammar", title: vietnamese ? "Ngữ pháp" : "Grammar", content: { topic: topic?.title ?? "", step: step ? `${step.step}/${topic?.steps.length ?? 1}` : "", focus: step?.focus ?? "", formula: step?.formula ?? "", usage: step?.usage ?? "", examples: step?.examples ?? [] } },
    { code: "pronunciation", title: vietnamese ? "Phát âm" : "Pronunciation", content: { focus: `/${sound?.ipa ?? ""}/`, tip, instruction: tip, words: examples.map((example) => ({ word: example.word, ipa: example.ipa })) } },
    { code: "listening", title: vietnamese ? "Nghe" : "Listening", content: { script: `${sentence} ${step?.examples[0] ?? ""}`.trim(), prompt: vietnamese ? `Người nói nhắc đến từ nào?` : "Which word does the speaker use?", options: wrongOptions(first?.word ?? "team", framework.vocabulary.filter((item) => item.word !== first?.word).slice(0, 6).map((item) => item.word)), answer: first?.word ?? "team" } },
    { code: "reading", title: vietnamese ? "Đọc" : "Reading", content: { text: words.map((word) => word.example).join(" "), prompt: vietnamese ? "Từ nào xuất hiện trong đoạn trên?" : "Which word appears in the text?", options: wrongOptions(words[1]?.word ?? first?.word ?? "", framework.vocabulary.filter((item) => !words.some((used) => used.word === item.word)).slice(0, 6).map((item) => item.word)), answer: words[1]?.word ?? first?.word ?? "" } },
    { code: "writing", title: vietnamese ? "Viết" : "Writing", content: { prompt: vietnamese ? `Viết 3–4 câu về công việc của bạn, dùng ${words.map((word) => word.word).join(", ")} và mẫu "${step?.formula ?? ""}".` : `Write 3–4 sentences about your work using ${words.map((word) => word.word).join(", ")} and the pattern "${step?.formula ?? ""}".`, answer: words.map((word) => word.example).join(" ") } },
    { code: "word_class", title: vietnamese ? "Từ loại" : "Word class", content: { prompt: vietnamese ? `Trong câu "${sentence}", từ "${first?.word ?? ""}" thuộc từ loại nào?` : `In "${sentence}", what part of speech is "${first?.word ?? ""}"?`, options: wrongOptions(first?.type ?? "noun", ["noun", "verb", "adjective", "adverb"]), answer: first?.type ?? "noun" } },
    { code: "word_use", title: vietnamese ? "Dùng từ" : "Word use", content: { prompt: vietnamese ? `Câu nào dùng "${first?.word ?? ""}" đúng?` : `Which sentence uses "${first?.word ?? ""}" correctly?`, options: wrongOptions(sentence, [`${sentence} very.`, `I ${first?.word ?? ""} in the very.`, `The ${first?.word ?? ""} are is good.`]), answer: sentence } },
    { code: "speaking", title: vietnamese ? "Nói" : "Speaking", content: { prompt: vietnamese ? "Nói to câu sau:" : "Say this sentence aloud:", answer: step?.examples[0] ?? sentence, modelAnswer: step?.examples[0] ?? sentence } }
  ];
  return { dayNumber: plan.lessonNumber, title, durationMinutes: 15, parts };
}

// ---------- Khung mẫu khi không có AI ----------

const SAMPLE_SOUNDS: FrameworkSound[] = [
  { ipa: "iː", label: "Nguyên âm dài /iː/", tip: "Kéo dài âm /iː/ và giữ môi hơi ngang.", tipEn: "Hold the long /iː/ with spread lips.", examples: w(["team", "tiːm"], ["meet", "miːt"], ["email", "ˈiːmeɪl"], ["read", "riːd"], ["lead", "liːd"], ["key", "kiː"], ["need", "niːd"], ["week", "wiːk"], ["see", "siː"], ["speak", "spiːk"], ["feel", "fiːl"], ["deal", "diːl"], ["agree", "əˈɡriː"], ["complete", "kəmˈpliːt"], ["receive", "rɪˈsiːv"], ["feedback", "ˈfiːdbæk"], ["reach", "riːtʃ"], ["teach", "tiːtʃ"]) },
  { ipa: "ɪ", label: "Nguyên âm ngắn /ɪ/", tip: "Âm ngắn, miệng mở nhẹ, không kéo dài.", tipEn: "Keep /ɪ/ short and relaxed; do not lengthen it.", examples: w(["skill", "skɪl"], ["list", "lɪst"], ["quick", "kwɪk"], ["finish", "ˈfɪnɪʃ"], ["business", "ˈbɪznəs"], ["minute", "ˈmɪnɪt"], ["fix", "fɪks"], ["ship", "ʃɪp"], ["system", "ˈsɪstəm"], ["visit", "ˈvɪzɪt"], ["begin", "bɪˈɡɪn"], ["limit", "ˈlɪmɪt"], ["simple", "ˈsɪmpl"], ["printer", "ˈprɪntə"], ["ticket", "ˈtɪkɪt"], ["dinner", "ˈdɪnə"], ["pick", "pɪk"], ["build", "bɪld"]) },
  { ipa: "θ", label: "Phụ âm /θ/", tip: "Đặt đầu lưỡi giữa hai hàm răng rồi thổi hơi, không rung dây thanh.", tipEn: "Place the tongue tip between the teeth and blow without voicing.", examples: w(["think", "θɪŋk"], ["thank", "θæŋk"], ["three", "θriː"], ["month", "mʌnθ"], ["thing", "θɪŋ"], ["both", "bəʊθ"], ["method", "ˈmeθəd"], ["path", "pɑːθ"], ["Thursday", "ˈθɜːzdeɪ"], ["through", "θruː"], ["health", "helθ"], ["growth", "ɡrəʊθ"], ["author", "ˈɔːθə"], ["thirty", "ˈθɜːti"], ["theme", "θiːm"], ["birthday", "ˈbɜːθdeɪ"], ["strength", "streŋθ"], ["thought", "θɔːt"]) },
  { ipa: "ʃ", label: "Phụ âm /ʃ/", tip: "Chu môi, đẩy hơi ra như tiếng 'suỵt'.", tipEn: "Round the lips and push air out as in 'shh'.", examples: w(["share", "ʃeə"], ["finish", "ˈfɪnɪʃ"], ["short", "ʃɔːt"], ["show", "ʃəʊ"], ["shift", "ʃɪft"], ["station", "ˈsteɪʃn"], ["should", "ʃʊd"], ["sure", "ʃʊə"], ["machine", "məˈʃiːn"], ["session", "ˈseʃn"], ["English", "ˈɪŋɡlɪʃ"], ["wish", "wɪʃ"], ["shop", "ʃɒp"], ["push", "pʊʃ"], ["action", "ˈækʃn"], ["option", "ˈɒpʃn"], ["special", "ˈspeʃl"], ["fresh", "freʃ"]) },
  { ipa: "æ", label: "Nguyên âm /æ/", tip: "Mở rộng miệng, hạ hàm dưới.", tipEn: "Open the mouth wide and drop the jaw for /æ/.", examples: w(["plan", "plæn"], ["manager", "ˈmænɪdʒə"], ["task", "tæsk"], ["happy", "ˈhæpi"], ["cancel", "ˈkænsl"], ["staff", "stæf"], ["answer", "ˈænsə"], ["chat", "tʃæt"], ["track", "træk"], ["handle", "ˈhændl"], ["catch", "kætʃ"], ["match", "mætʃ"], ["gap", "ɡæp"], ["flat", "flæt"], ["add", "æd"], ["bank", "bæŋk"], ["black", "blæk"], ["travel", "ˈtrævl"]) },
  { ipa: "əʊ", label: "Nguyên âm đôi /əʊ/", tip: "Bắt đầu ở /ə/ rồi trượt sang /ʊ/, môi tròn dần.", tipEn: "Start at /ə/ and glide to /ʊ/, rounding the lips.", examples: w(["phone", "fəʊn"], ["note", "nəʊt"], ["go", "ɡəʊ"], ["show", "ʃəʊ"], ["home", "həʊm"], ["close", "kləʊz"], ["know", "nəʊ"], ["open", "ˈəʊpən"], ["goal", "ɡəʊl"], ["code", "kəʊd"], ["role", "rəʊl"], ["whole", "həʊl"], ["slow", "sləʊ"], ["own", "əʊn"], ["moment", "ˈməʊmənt"], ["focus", "ˈfəʊkəs"], ["mobile", "ˈməʊbaɪl"], ["process", "ˈprəʊses"]) }
];

function w(...pairs: Array<[string, string]>): Array<{ word: string; ipa: string }> {
  return pairs.map(([word, ipa]) => ({ word, ipa }));
}

const SAMPLE_WORDS: Array<[string, string, string, string, string, boolean]> = [
  ["colleague", "noun", "ˈkɒliːɡ", "đồng nghiệp", "My colleague joins the call.", false],
  ["deadline", "noun", "ˈdedlaɪn", "hạn chót", "The deadline is Friday.", true],
  ["meeting", "noun", "ˈmiːtɪŋ", "cuộc họp", "We have a meeting at nine.", false],
  ["report", "noun", "rɪˈpɔːt", "báo cáo", "I send the report every week.", false],
  ["schedule", "noun", "ˈʃedjuːl", "lịch làm việc", "Please check the schedule.", true],
  ["prepare", "verb", "prɪˈpeə", "chuẩn bị", "I prepare the agenda.", true],
  ["review", "verb", "rɪˈvjuː", "xem lại", "We review the data together.", true],
  ["update", "noun", "ˈʌpdeɪt", "cập nhật", "Here is a quick update.", true],
  ["client", "noun", "ˈklaɪənt", "khách hàng", "The client calls on Monday.", false],
  ["project", "noun", "ˈprɒdʒekt", "dự án", "This project ends in June.", true],
  ["team", "noun", "tiːm", "nhóm", "Our team has five people.", false],
  ["office", "noun", "ˈɒfɪs", "văn phòng", "The office opens at eight.", false],
  ["email", "noun", "ˈiːmeɪl", "thư điện tử", "I reply to the email.", false],
  ["task", "noun", "tɑːsk", "nhiệm vụ", "This task takes one hour.", true],
  ["manager", "noun", "ˈmænɪdʒə", "quản lý", "My manager approves the plan.", false],
  ["feedback", "noun", "ˈfiːdbæk", "phản hồi", "Thank you for the feedback.", true],
  ["agree", "verb", "əˈɡriː", "đồng ý", "I agree with the plan.", true],
  ["confirm", "verb", "kənˈfɜːm", "xác nhận", "Please confirm the time.", true],
  ["finish", "verb", "ˈfɪnɪʃ", "hoàn thành", "We finish at five.", true],
  ["plan", "noun", "plæn", "kế hoạch", "The plan has three steps.", true],
  ["customer", "noun", "ˈkʌstəmə", "khách hàng", "The customer is happy.", false],
  ["invoice", "noun", "ˈɪnvɔɪs", "hoá đơn", "I send the invoice today.", false],
  ["budget", "noun", "ˈbʌdʒɪt", "ngân sách", "The budget is small.", true],
  ["contract", "noun", "ˈkɒntrækt", "hợp đồng", "We sign the contract.", false],
  ["goal", "noun", "ɡəʊl", "mục tiêu", "Our goal is clear.", true],
  ["result", "noun", "rɪˈzʌlt", "kết quả", "The result is good.", true],
  ["problem", "noun", "ˈprɒbləm", "vấn đề", "We fix the problem.", true],
  ["solution", "noun", "səˈluːʃn", "giải pháp", "This solution works.", true],
  ["decision", "noun", "dɪˈsɪʒn", "quyết định", "We make a decision today.", true],
  ["priority", "noun", "praɪˈɒrəti", "ưu tiên", "Safety is a priority.", true],
  ["request", "noun", "rɪˈkwest", "yêu cầu", "I receive a request.", true],
  ["support", "verb", "səˈpɔːt", "hỗ trợ", "I support the new staff.", true],
  ["explain", "verb", "ɪkˈspleɪn", "giải thích", "Can you explain the task?", true],
  ["suggest", "verb", "səˈdʒest", "gợi ý", "I suggest a new idea.", true],
  ["improve", "verb", "ɪmˈpruːv", "cải thiện", "We improve the process.", true],
  ["attend", "verb", "əˈtend", "tham dự", "I attend the meeting.", true],
  ["schedule", "verb", "ˈʃedjuːl", "lên lịch", "Let's schedule a call.", true],
  ["deliver", "verb", "dɪˈlɪvə", "giao, bàn giao", "We deliver on time.", true],
  ["discuss", "verb", "dɪˈskʌs", "thảo luận", "Let's discuss the plan.", true],
  ["organise", "verb", "ˈɔːɡənaɪz", "sắp xếp", "I organise the files.", true],
  ["laptop", "noun", "ˈlæptɒp", "máy tính xách tay", "My laptop is new.", false],
  ["printer", "noun", "ˈprɪntə", "máy in", "The printer is broken.", false],
  ["desk", "noun", "desk", "bàn làm việc", "My desk is clean.", false],
  ["calendar", "noun", "ˈkælɪndə", "lịch", "Check the calendar.", false],
  ["document", "noun", "ˈdɒkjumənt", "tài liệu", "Open the document.", false],
  ["folder", "noun", "ˈfəʊldə", "thư mục", "Save it in the folder.", false],
  ["password", "noun", "ˈpɑːswɜːd", "mật khẩu", "Change your password.", true],
  ["website", "noun", "ˈwebsaɪt", "trang web", "The website is live.", false],
  ["phone", "noun", "fəʊn", "điện thoại", "Answer the phone, please.", false],
  ["message", "noun", "ˈmesɪdʒ", "tin nhắn", "I read your message.", true],
  ["early", "adverb", "ˈɜːli", "sớm", "I arrive early.", true],
  ["usually", "adverb", "ˈjuːʒuəli", "thường", "I usually check email first.", true],
  ["quickly", "adverb", "ˈkwɪkli", "nhanh chóng", "Reply quickly, please.", true],
  ["carefully", "adverb", "ˈkeəfəli", "cẩn thận", "Read it carefully.", true],
  ["busy", "adjective", "ˈbɪzi", "bận", "I am busy today.", true],
  ["available", "adjective", "əˈveɪləbl", "rảnh, sẵn sàng", "Are you available at two?", true],
  ["important", "adjective", "ɪmˈpɔːtnt", "quan trọng", "This is important.", true],
  ["urgent", "adjective", "ˈɜːdʒənt", "khẩn", "The request is urgent.", true],
  ["helpful", "adjective", "ˈhelpfl", "hữu ích", "Your note is helpful.", true],
  ["late", "adjective", "leɪt", "muộn", "The train is late.", true],
  ["weekly", "adjective", "ˈwiːkli", "hằng tuần", "We have a weekly call.", true],
  ["summary", "noun", "ˈsʌməri", "tóm tắt", "Send a short summary.", true],
  ["presentation", "noun", "ˌpreznˈteɪʃn", "bài thuyết trình", "The presentation is ready.", false],
  ["training", "noun", "ˈtreɪnɪŋ", "đào tạo", "Training starts Monday.", true],
  ["holiday", "noun", "ˈhɒlədeɪ", "ngày nghỉ", "Friday is a holiday.", true],
  ["salary", "noun", "ˈsæləri", "lương", "Salary is paid monthly.", true],
  ["interview", "noun", "ˈɪntəvjuː", "phỏng vấn", "The interview is at ten.", false],
  ["experience", "noun", "ɪkˈspɪəriəns", "kinh nghiệm", "I have two years of experience.", true],
  ["skill", "noun", "skɪl", "kỹ năng", "Typing is a useful skill.", true],
  ["progress", "noun", "ˈprəʊɡres", "tiến độ", "We check progress weekly.", true],
  ["quality", "noun", "ˈkwɒləti", "chất lượng", "Quality is our focus.", true],
  ["process", "noun", "ˈprəʊses", "quy trình", "Follow the process.", true],
  ["service", "noun", "ˈsɜːvɪs", "dịch vụ", "The service is fast.", true],
  ["product", "noun", "ˈprɒdʌkt", "sản phẩm", "The product ships today.", false],
  ["market", "noun", "ˈmɑːkɪt", "thị trường", "The market is growing.", true],
  ["partner", "noun", "ˈpɑːtnə", "đối tác", "Our partner visits tomorrow.", false],
  ["supplier", "noun", "səˈplaɪə", "nhà cung cấp", "The supplier is late.", false],
  ["branch", "noun", "brɑːntʃ", "chi nhánh", "The branch opens soon.", false],
  ["warehouse", "noun", "ˈweəhaʊs", "nhà kho", "The warehouse is full.", false],
  ["delivery", "noun", "dɪˈlɪvəri", "giao hàng", "Delivery takes two days.", true],
  ["complaint", "noun", "kəmˈpleɪnt", "khiếu nại", "We handle the complaint.", true],
  ["apologise", "verb", "əˈpɒlədʒaɪz", "xin lỗi", "I apologise for the delay.", true],
  ["remind", "verb", "rɪˈmaɪnd", "nhắc", "Please remind me tomorrow.", true],
  ["cancel", "verb", "ˈkænsl", "huỷ", "We cancel the meeting.", true],
  ["postpone", "verb", "pəˈspəʊn", "hoãn", "Let's postpone the call.", true],
  ["achieve", "verb", "əˈtʃiːv", "đạt được", "We achieve the goal.", true],
  ["negotiate", "verb", "nɪˈɡəʊʃieɪt", "đàm phán", "We negotiate the price.", true],
  ["recommend", "verb", "ˌrekəˈmend", "đề xuất", "I recommend this tool.", true],
  ["measure", "verb", "ˈmeʒə", "đo lường", "We measure results monthly.", true]
];

const SAMPLE_GRAMMAR: Record<CefrLevel, FrameworkGrammarTopic[]> = {
  A1: [
    topic("Hiện tại đơn với to be", "Giới thiệu bản thân và công việc", [
      ["I am / You are", "I am + danh từ", "Giới thiệu tên và nghề.", ["I am a tester.", "You are my colleague."]],
      ["He / She is", "He is + danh từ", "Nói về người khác trong nhóm.", ["She is a manager.", "He is in the office."]],
      ["Phủ định và câu hỏi", "Am I…? / Is she…? / I am not", "Hỏi và trả lời về vai trò.", ["Is she a manager?", "I am not busy."]]
    ]),
    topic("Hiện tại đơn với động từ thường", "Thói quen và việc hằng ngày", [
      ["I / You / We work", "I + V", "Mô tả việc làm mỗi ngày.", ["I check email every day.", "We finish at five."]],
      ["He / She works", "He + V-s", "Nói về việc đồng nghiệp làm.", ["She prepares the report.", "He calls the client."]],
      ["Câu hỏi với do / does", "Do you…? / Does she…?", "Hỏi về công việc.", ["Do you attend the meeting?", "Does he work here?"]]
    ]),
    topic("There is / There are và giới từ nơi chốn", "Mô tả văn phòng", [
      ["There is / There are", "There is + danh từ số ít / There are + số nhiều", "Mô tả đồ vật trong văn phòng.", ["There is a printer.", "There are two desks."]],
      ["Giới từ in / on / at", "in the office · on the desk · at the meeting", "Nói vị trí.", ["The laptop is on the desk.", "We are at the meeting."]],
      ["Câu hỏi Where / Is there", "Where is…? / Is there…?", "Hỏi vị trí.", ["Where is the folder?", "Is there a printer here?"]]
    ])
  ],
  A2: [
    topic("Quá khứ đơn", "Kể lại việc đã làm", [
      ["Động từ có quy tắc", "S + V-ed", "Kể việc đã xong.", ["I finished the report yesterday.", "We discussed the plan."]],
      ["Động từ bất quy tắc", "S + V2", "Dùng went, had, sent…", ["I sent the invoice.", "She went to the client."]],
      ["Phủ định và câu hỏi", "didn't + V / Did you…?", "Hỏi về hôm qua.", ["Did you attend the training?", "I didn't cancel the meeting."]]
    ]),
    topic("Hiện tại tiếp diễn", "Việc đang làm tuần này", [
      ["Khẳng định", "S + am/is/are + V-ing", "Việc đang xảy ra.", ["I am preparing the agenda.", "We are reviewing the data."]],
      ["Câu hỏi", "What are you doing?", "Hỏi về việc đang làm.", ["What are you working on?", "Is she attending the call?"]],
      ["So sánh với hiện tại đơn", "usually + V / now + V-ing", "Thói quen và tạm thời.", ["I usually work in the office, but this week I am working from home."]]
    ]),
    topic("Tương lai với going to và will", "Kế hoạch và lời hứa", [
      ["be going to", "S + am/is/are going to + V", "Kế hoạch đã định.", ["We are going to deliver on Friday."]],
      ["will cho quyết định tức thời", "I will + V", "Lời hứa, quyết định.", ["I will confirm the time.", "I will remind you tomorrow."]],
      ["Câu hỏi và phủ định", "Will you…? / won't", "Hỏi về kế hoạch.", ["Will you attend?", "We won't postpone the call."]]
    ])
  ],
  B1: [
    topic("Present perfect", "Experience and recent results", [
      ["Form and use", "S + have/has + V3", "Talk about results so far.", ["We have finished the first phase.", "She has sent the summary."]],
      ["for / since / yet / already", "have + V3 + for/since", "Duration and completion.", ["I have worked here for two years.", "Have you confirmed yet?"]],
      ["Present perfect vs past simple", "have done vs did", "Choose the right tense in updates.", ["I have reviewed the data; I reviewed it yesterday."]]
    ]),
    topic("Modals for requests and advice", "Polite workplace communication", [
      ["could / would for requests", "Could you + V?", "Make polite requests.", ["Could you share the document?"]],
      ["should / had better", "You should + V", "Give advice.", ["You should confirm the deadline early."]],
      ["have to / must", "We have to + V", "Obligation in processes.", ["We have to measure results monthly."]]
    ]),
    topic("First conditional", "Plans with conditions", [
      ["if + present, will", "If we deliver early, the client will be happy.", "Likely outcomes.", ["If the supplier is late, we will postpone."]],
      ["unless / as long as", "Unless we agree, we won't sign.", "Variations.", ["As long as quality is high, the budget is fine."]],
      ["Questions and negatives", "What will you do if…?", "Discuss risks.", ["What will we do if the printer breaks?"]]
    ])
  ],
  B2: [
    topic("Passive voice in reports", "Describing processes", [
      ["Present and past passive", "is/was + V3", "Focus on the process.", ["The invoice is sent monthly.", "The contract was signed in May."]],
      ["Passive with modals", "should be + V3", "Recommendations.", ["Feedback should be collected weekly."]],
      ["Passive reporting", "It is said that…", "Formal updates.", ["It is expected that delivery will improve."]]
    ]),
    topic("Reported speech", "Summarising meetings", [
      ["Statements", "She said (that) she would…", "Report decisions.", ["The manager said the budget was approved."]],
      ["Questions and requests", "He asked whether… / asked us to…", "Report requests.", ["The client asked whether we could deliver early."]],
      ["Reporting verbs", "suggest / recommend / agree", "Precise summaries.", ["She recommended postponing the launch."]]
    ]),
    topic("Second and third conditionals", "Analysing alternatives", [
      ["Second conditional", "If we had more staff, we would…", "Hypothetical now.", ["If the budget were bigger, we would hire a partner."]],
      ["Third conditional", "If we had confirmed earlier, we would have…", "Past regrets.", ["If the supplier had delivered, we would have shipped."]],
      ["Mixed conditionals", "If we had planned better, we would be…", "Linking past and present.", ["If we had negotiated, we would be under budget now."]]
    ])
  ],
  C1: [
    topic("Advanced cohesion", "Structuring arguments", [
      ["Linking adverbials", "Consequently / Nevertheless / In contrast", "Connect ideas.", ["The market is growing; nevertheless, margins are thin."]],
      ["Cleft sentences", "What matters is… / It was X that…", "Emphasis.", ["What matters is the quality of the delivery."]],
      ["Inversion", "Not only did we…, but… / Rarely have we…", "Formal emphasis.", ["Not only did we achieve the goal, but we also improved quality."]]
    ]),
    topic("Hedging and nuance", "Diplomatic language", [
      ["Modal hedges", "might / could / would seem", "Soften claims.", ["This would seem to suggest a supplier issue."]],
      ["Distancing", "It appears that… / There is a tendency to…", "Neutral tone.", ["It appears that complaints have increased."]],
      ["Concession", "While / Although / Granted", "Balanced arguments.", ["While the budget is tight, the priority is clear."]]
    ]),
    topic("Nominalisation and formal register", "Executive summaries", [
      ["Verb to noun", "deliver → delivery, decide → decision", "Compact summaries.", ["The delivery of the product was delayed."]],
      ["Complex noun phrases", "the implementation of the new process", "Formal writing.", ["The negotiation of the contract took a month."]],
      ["Register shift", "informal → formal", "Rewrite for executives.", ["We fixed it. → The issue has been resolved."]]
    ])
  ]
};

function topic(title: string, summary: string, steps: Array<[string, string, string, string[]]>): FrameworkGrammarTopic {
  return { title, summary, steps: steps.map(([focus, formula, usage, examples], index) => ({ step: index + 1, focus, formula, usage, examples })) };
}

/** Khung mẫu cố định theo level để test trọn luồng khi không có AI. Deterministic. */
export function buildSampleFramework(cefr: CefrLevel, settings: MonthFrameworkSettings = DEFAULT_MONTH_FRAMEWORK_SETTINGS): MonthFramework {
  const offset = { A1: 0, A2: 7, B1: 14, B2: 21, C1: 28 }[cefr];
  const vocabulary: FrameworkVocabularyItem[] = [];
  const seen = new Set<string>();
  for (let index = 0; vocabulary.length < settings.vocabularyCount && index < SAMPLE_WORDS.length; index += 1) {
    const entry = SAMPLE_WORDS[(index + offset) % SAMPLE_WORDS.length]!;
    if (seen.has(entry[0])) continue;
    seen.add(entry[0]);
    vocabulary.push({ word: entry[0], type: entry[1], ipa: `/${entry[2]}/`, meaning: entry[3], example: entry[4], abstract: entry[5] });
  }
  const grammarPool = SAMPLE_GRAMMAR[cefr];
  const grammarTopics: FrameworkGrammarTopic[] = [];
  for (let index = 0; index < settings.grammarTopicCount; index += 1) grammarTopics.push(grammarPool[index % grammarPool.length]!);
  const sounds: FrameworkSound[] = [];
  for (let index = 0; index < settings.soundCount; index += 1) sounds.push(SAMPLE_SOUNDS[(index + offset) % SAMPLE_SOUNDS.length]!);
  return { cefr, vocabulary, grammarTopics, sounds };
}
