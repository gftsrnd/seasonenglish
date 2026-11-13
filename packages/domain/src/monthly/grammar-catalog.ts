import type { CefrLevel } from "@e4s/contracts";

/**
 * Product grammar roadmap (docs/grammar-roadmap.md, tài liệu 03/11/2026)
 * encoded as one ordered catalog of six topic pairs per level. Month numbers in
 * the roadmap are ignored (product decision, same as pronunciation): each month
 * takes the NEXT pair in roadmap order that the same level has not taught in
 * the previous 12 months; once all six pairs are covered a new cycle starts
 * from the first pair. Code locks the pair, both topics and their "Nội dung"
 * coverage list; the AI only writes explanations, examples and exercises.
 */

export type MonthlyGrammarPairType = "contrast" | "extension" | "complement";

export interface MonthlyGrammarCatalogTopic {
  /** Stable catalog ID stored on the generated topic (`catalogId`), e.g. "a2-p2-a". */
  id: string;
  side: "A" | "B";
  /** Topic name as written in the roadmap (Vietnamese). */
  titleVi: string;
  /** Common English name, used as the topic title from B1 upwards. */
  titleEn: string;
  /** The roadmap "Nội dung" list the six scaffolding steps must cover, in roadmap wording. */
  contents: readonly string[];
}

export interface MonthlyGrammarCatalogPair {
  /** Stable pair ID, e.g. "a2-p2". */
  id: string;
  cefr: CefrLevel;
  /** 1-based position inside the level (roadmap row order). */
  order: number;
  /** Month number printed in the roadmap; reference only, never used for selection. */
  roadmapMonth: number;
  pairType: MonthlyGrammarPairType;
  situationVi: string;
  situationEn: string;
  topicA: MonthlyGrammarCatalogTopic;
  topicB: MonthlyGrammarCatalogTopic;
}

export const MONTHLY_GRAMMAR_PAIR_TYPE_LABELS: Readonly<Record<MonthlyGrammarPairType, { vi: string; en: string }>> = {
  contrast: { vi: "Đối lập", en: "contrast (easily confused, must be told apart)" },
  extension: { vi: "Mở rộng", en: "extension (B builds on A)" },
  complement: { vi: "Bổ trợ", en: "complement (A and B serve the same workplace situation)" }
};

type Seed = readonly [titleEnA: string, rowA: string, titleEnB: string, rowB: string, type: MonthlyGrammarPairType, situationVi: string, situationEn: string];

const A1_SEEDS: readonly Seed[] = [
  ["The verb to be", "Động từ to be: am/is/are; phủ định isn't/aren't; câu hỏi Are you…? Is he…?; trả lời ngắn Yes, I am",
    "Pronouns and possessives", "Đại từ & sở hữu: I/me/my/mine; he/him/his; they/them/their; sở hữu cách 's (Anna's desk); Whose…?",
    "complement", "giới thiệu bản thân và đồng nghiệp", "introducing yourself and colleagues"],
  ["Present simple", "Hiện tại đơn: V/V-s, quy tắc thêm -s/-es; don't/doesn't; Do/Does…?; trạng từ tần suất always/usually/often/never và vị trí",
    "Present continuous", "Hiện tại tiếp diễn: am/is/are + V-ing; quy tắc thêm -ing; phủ định, câu hỏi; now/at the moment; phân biệt với hiện tại đơn",
    "contrast", "thói quen công việc vs việc đang làm", "work routines vs what is happening now"],
  ["Nouns and basic articles", "Danh từ & mạo từ cơ bản: số ít/số nhiều (-s/-es, bất quy tắc people/men); đếm được/không đếm được; a/an; the khi đã biết đối tượng; a bottle of / a cup of",
    "Demonstratives and quantifiers", "Từ chỉ định & lượng từ: this/that/these/those; one/ones; some/any; much/many/a lot of; How much/How many…?",
    "complement", "văn phòng phẩm, đặt đồ ăn trưa", "office supplies and ordering lunch"],
  ["There is/are and have got", "There is/are & have got: there is/are, there was/were; Is there…?; have/has got; have (sở hữu)",
    "Prepositions of time and place", "Giới từ thời gian & nơi chốn: at/on/in + giờ/ngày/tháng; in/at/on + nơi chốn; next to, between, under, behind, opposite",
    "complement", "mô tả văn phòng, lịch họp", "describing the office and the meeting schedule"],
  ["Past simple", "Quá khứ đơn: was/were; V-ed (quy tắc chính tả); 20–30 động từ bất quy tắc thông dụng; didn't; Did you…?; yesterday/last week/ago",
    "Wh- and yes/no questions", "Câu hỏi Wh- & Yes/No: trật tự từ trong câu hỏi; What/Where/When/Who/Why/How; Which vs What; How long/How often/How far",
    "extension", "hỏi về cuối tuần, chuyến công tác", "asking about the weekend and business trips"],
  ["Can, would like and imperatives", "can, would like & mệnh lệnh: can/can't, could (quá khứ); Can I…?/Can you…?; I'd like / Would you like…?; câu mệnh lệnh Do/Don't; Let's",
    "Adjectives, adverbs and comparison", "Tính từ, trạng từ & so sánh: vị trí tính từ; trạng từ -ly (quick → quickly), good → well; so sánh hơn -er/more; than; so sánh nhất the -est/most; not as…as",
    "complement", "nhờ vả, đề nghị, so sánh lựa chọn", "asking for help, making offers and comparing options"]
];

const A2_SEEDS: readonly Seed[] = [
  ["Past continuous and used to", "Quá khứ tiếp diễn & used to: was/were + V-ing; hành động đang xảy ra thì hành động khác xen vào; used to + V (thói quen cũ)",
    "Conjunctions and time clauses", "Liên từ & mệnh đề thời gian: and/but/or/so/because; when/while/before/after; dấu phẩy khi mệnh đề phụ đứng đầu",
    "complement", "kể lại một sự cố ở công ty", "telling the story of a problem at work"],
  ["Present perfect 1", "Hiện tại hoàn thành 1: have/has + V3; just/already/yet; ever/never; Have you ever…?; been vs gone",
    "Present perfect 2", "Hiện tại hoàn thành 2: for/since; How long have you…?; ago; phân biệt HTHT với quá khứ đơn (có mốc thời gian xác định)",
    "extension", "cập nhật công việc, kinh nghiệm làm việc", "work updates and work experience"],
  ["Future forms", "Tương lai: hiện tại tiếp diễn cho lịch đã hẹn; be going to (dự định); will (quyết định tức thì, dự đoán, hứa); Shall I/we…?; might (có thể)",
    "Modals of obligation and advice", "Modal nghĩa vụ & lời khuyên: must/mustn't; have to/don't have to; don't need to; should/shouldn't",
    "complement", "kế hoạch dự án và quy định công ty", "project plans and company rules"],
  ["Questions and auxiliaries", "Câu hỏi nâng cao & trợ động từ: câu hỏi chủ ngữ vs tân ngữ (Who called you? / Who did you call?); giới từ cuối câu hỏi (Who are you talking to?); What…like?; câu hỏi gián tiếp Do you know where…?; trả lời ngắn; So do I / Neither do I",
    "Indefinite pronouns and quantifiers", "Đại từ bất định & lượng từ: somebody/anything/nobody/nowhere; no/none; every/all; both/either/neither; (a) few / (a) little; myself/yourself (đại từ phản thân)",
    "complement", "hỏi – đáp trong cuộc họp, nhờ hỗ trợ", "questions and answers in meetings, asking for support"],
  ["-ing forms and to-infinitives", "V-ing & to-V cơ bản: động từ + V-ing (enjoy, finish, mind); động từ + to-V (want, decide, plan); want/ask somebody to do; to-V chỉ mục đích (I called to ask…)",
    "Basic reported speech", "Câu tường thuật cơ bản: said (that)… / told me (that)…; lùi thì cơ bản (is → was, will → would); say vs tell; told me to / asked me to",
    "extension", "chuyển lời sếp, lời khách hàng", "passing on what the manager or a client said"],
  ["First and second conditionals", "Câu điều kiện loại 1 & 2: If + hiện tại, will…; If + quá khứ, would…; If I were you…; phân biệt if và when",
    "Basic relative clauses", "Mệnh đề quan hệ cơ bản: who/which/that; lược bỏ đại từ khi làm tân ngữ (the client we met); giới từ cuối mệnh đề (the hotel you stayed at)",
    "complement", "đưa phương án, mô tả người/sản phẩm", "giving options and describing people or products"]
];

const B1_SEEDS: readonly Seed[] = [
  ["Present simple vs present continuous", "Hiện tại đơn vs tiếp diễn: sự thật vs tạm thời; động từ trạng thái (know, need, belong) không dùng tiếp diễn; think/have/see đổi nghĩa; always + tiếp diễn (phàn nàn)",
    "Past simple vs past continuous and past habits", "Quá khứ đơn vs tiếp diễn & thói quen quá khứ: chuỗi hành động vs bối cảnh; when vs while; used to vs would (thói quen); have vs have got",
    "contrast", "mô tả công việc hiện tại và trước đây", "describing your current and previous jobs"],
  ["Present perfect simple and continuous", "Hiện tại hoàn thành đơn & tiếp diễn: have been + V-ing; nhấn kết quả vs nhấn quá trình; How long…? với for/since; It's the first time I've…",
    "Present perfect, past simple and past perfect", "HTHT vs quá khứ đơn & quá khứ hoàn thành: thời gian chưa kết thúc (today, this week) vs đã kết thúc; had + V3; had been + V-ing; quá khứ hoàn thành trong kể chuyện",
    "extension", "báo cáo tiến độ, kể lại diễn biến dự án", "progress reports and the story of a project"],
  ["Future forms in full", "Tương lai toàn diện: hiện tại đơn cho lịch trình (The meeting starts at 9); will vs going to; will be doing; will have done; when/as soon as/until + hiện tại (when I finish / when I've finished)",
    "Modals of ability and deduction", "Modal khả năng & suy luận: can/could/be able to; must/can't (suy luận chắc chắn); may/might/could (có thể); may/might not",
    "complement", "lập kế hoạch và dự đoán rủi ro", "planning and predicting risks"],
  ["Obligation, advice and polite requests", "Modal nghĩa vụ, lời khuyên & lời đề nghị lịch sự: have to vs must; mustn't vs don't have to/needn't; should/ought to; had better; It's time…; Could you…? / Would you mind -ing? / May I…?",
    "First and second conditionals and wish", "Câu điều kiện 1–2 & wish hiện tại: phân biệt loại 1 và 2 (khả năng thật vs giả định); unless; I wish + quá khứ đơn; wish + could",
    "complement", "đề xuất giải pháp, nhờ vả lịch sự", "suggesting solutions and making polite requests"],
  ["The passive", "Bị động 1–2: be + V3 ở các thì (is done, was done, has been done, is being done, will be done); by + tác nhân; bị động với modal (must be sent)",
    "Reported speech, indirect questions and question tags", "Tường thuật, câu hỏi gián tiếp & câu hỏi đuôi: lùi thì và khi không cần lùi; đổi trạng từ thời gian; asked if/whether; asked where… (không đảo ngữ); I think so / I hope not; câu hỏi đuôi (isn't it? didn't you?)",
    "complement", "viết biên bản họp, báo cáo quy trình", "writing meeting minutes and process reports"],
  ["Articles and nouns", "Mạo từ & danh từ: a/an vs the; không mạo từ khi nói chung (Coffee is…); go to work / at school / the school; danh từ đếm được/không đếm được hay sai (information, advice, equipment); noun + noun (a project manager); 's vs of",
    "Adjectives, adverbs and comparison", "Tính từ, trạng từ & so sánh: -ing vs -ed (boring/bored); trật tự tính từ; so vs such; enough vs too; quite/rather/pretty; much/far/a bit + so sánh hơn; as…as; the + so sánh nhất + HTHT (the best I've ever…)",
    "complement", "mô tả và so sánh sản phẩm, số liệu", "describing and comparing products and figures"]
];

const B2_SEEDS: readonly Seed[] = [
  ["Modal verbs with have + past participle", "Modal + have V3: must have / can't have (suy luận quá khứ); may/might/could have; should have / shouldn't have (tiếc nuối, phê bình); could have (đã có thể); would (thói quen quá khứ, tình huống giả định)",
    "Third and mixed conditionals and wish", "Câu điều kiện loại 3, hỗn hợp & wish quá khứ: If + had V3, would have V3; hỗn hợp (If I had…, I would be…); I wish I had…; If only…; wish + would (phàn nàn)",
    "complement", "họp rút kinh nghiệm sau dự án", "a project review meeting (lessons learned)"],
  ["-ing forms and to-infinitives 1", "V-ing / to-V 1: động từ + V-ing; động từ + to-V; động từ + tân ngữ + to-V; make/let + V nguyên mẫu; đổi nghĩa: remember/forget/regret/stop/try/need; like/would like; prefer/would rather",
    "-ing forms and to-infinitives 2", "V-ing / to-V 2: giới từ + V-ing (interested in, instead of); be/get used to + V-ing vs used to V; động từ + giới từ + V-ing (insist on, succeed in); it's worth / there's no point in / have difficulty -ing; to / in order to / so that; tính từ + to-V; see/hear sb do vs doing; mệnh đề -ing",
    "extension", "viết email đề nghị, trình bày ý kiến", "writing proposal emails and giving opinions"],
  ["Advanced passive", "Bị động nâng cao: bị động với 2 tân ngữ (I was given…); being done / to be done / having been done; It is said/reported that…; He is said/expected to…; be supposed to; have/get something done",
    "Relative clauses in full", "Mệnh đề quan hệ đầy đủ: xác định vs không xác định (dấu phẩy, không dùng that); whose/whom/where/when; which thay cả mệnh đề; most of whom / some of which; rút gọn bằng V-ing/V3 (the person responsible, the report sent yesterday)",
    "complement", "văn phong báo cáo, thông báo trang trọng", "formal reports and announcements"],
  ["Conjunctions and adverbial clauses", "Liên từ & mệnh đề trạng ngữ: although/though/even though vs in spite of/despite; in case; unless/as long as/provided (that); as (khi, vì); like vs as; as if/as though; during/for/while; by vs until; by the time",
    "Word order and adverbs", "Trật tự từ & trạng từ: động từ + tân ngữ không tách rời; nơi chốn trước thời gian; vị trí trạng từ với động từ (also, always, probably, even); still / yet / already / any more",
    "complement", "viết email mạch lạc, nêu điều kiện hợp đồng", "writing clear emails and stating contract conditions"],
  ["Pronouns, quantifiers and articles", "Đại từ, lượng từ & mạo từ nâng cao: a friend of mine, on my own / by myself; each other; there vs it; all/all of, most/most of, none of; both/either/neither of; all vs every vs whole; each vs every; the + danh từ chỉ loại (the smartphone), the + tính từ (the unemployed); the với tên riêng (công ty, tổ chức, địa danh)",
    "Prepositions and collocations", "Giới từ nâng cao & kết hợp từ: on time vs in time, at the end vs in the end; in/on/at mở rộng; by (phương tiện, tác nhân); danh từ + giới từ (reason for, increase in, demand for); tính từ + giới từ (responsible for, aware of); động từ + giới từ (apply for, depend on, consist of)",
    "complement", "viết cụm danh từ chính xác trong báo cáo", "writing precise noun phrases in reports"],
  ["Phrasal verbs 1", "Phrasal verbs 1: cấu trúc có thể tách/không tách (turn it off, look after it); nhóm in/out (fill in, find out, point out, run out of); nhóm on/off (carry on, put off, call off, take on)",
    "Phrasal verbs 2", "Phrasal verbs 2: nhóm up/down (set up, follow up, bring up, turn down, cut down on); nhóm away/back (get back to, put back, give away); động từ 3 thành phần (come up with, catch up on)",
    "extension", "hội thoại công sở tự nhiên", "natural workplace conversation"]
];

const C1_SEEDS: readonly Seed[] = [
  ["Tense and nuance", "Thì & sắc thái: động từ trạng thái dùng tiếp diễn để nhấn mạnh (I'm loving…); hiện tại đơn khi kể chuyện/tóm tắt; tiếp diễn để lịch sự hơn (I was wondering if…); HTHT tiếp diễn chỉ dấu vết còn lại; quá khứ hoàn thành vs quá khứ đơn khi không bắt buộc",
    "Advanced future forms", "Tương lai nâng cao: be to (lịch chính thức); be about to / be on the point of; be due to; be bound/likely to; tương lai trong quá khứ (was going to, was to have, would)",
    "extension", "thông báo kế hoạch, cập nhật lịch trình", "announcing plans and updating schedules"],
  ["Advanced modal verbs", "Modal nâng cao: will/would cho thói quen và đặc tính; needn't have vs didn't need to; be supposed to / be meant to; may well / might as well; mức độ chắc chắn (will → should → may → might)",
    "Advanced conditionals", "Câu điều kiện nâng cao: If + should / were to; đảo ngữ Should you… / Were we to… / Had I known…; even if; provided/providing; but for / otherwise; if it weren't for / if it hadn't been for",
    "complement", "đàm phán, đưa điều khoản", "negotiating and setting terms"],
  ["Advanced passive and reporting structures", "Bị động & cấu trúc tường thuật nâng cao: get-passive; bị động với động từ tường thuật (is thought to have…); động từ tường thuật đa dạng (admit, deny, claim, urge, recommend) và cấu trúc đi kèm; tường thuật câu hỏi, đề nghị, lời khuyên",
    "Verb complements and the subjunctive", "Bổ ngữ động từ & giả định cách: động từ + that-clause; giả định cách (recommend that he be…, it is essential that…); should trong that-clause; động từ + tân ngữ + bổ ngữ (consider it important, find him reliable); động từ nối (seem, appear, prove, turn out)",
    "complement", "văn bản chính thức, khuyến nghị, biên bản", "official documents, recommendations and minutes"],
  ["Nouns, articles and subject-verb agreement", "Danh từ, mạo từ & hòa hợp chủ – vị: danh từ tập hợp (the team is/are); a number of vs the number of; danh từ trừu tượng có/không có mạo từ; danh từ ghép và cụm danh từ dài; chủ ngữ dài, chủ ngữ là mệnh đề",
    "Advanced relative and participle clauses", "Mệnh đề quan hệ & mệnh đề phân từ nâng cao: giới từ + whom/which (to whom, in which); whereby, whereas; mệnh đề phân từ chỉ lý do/thời gian/kết quả (Having checked the data, …); lỗi phân từ treo; with + O + V-ing",
    "complement", "viết báo cáo phân tích, câu dài mà vẫn rõ", "writing analytical reports with long but clear sentences"],
  ["Advanced adjectives and adverbs", "Tính từ & trạng từ nâng cao: tính từ phân cấp vs không phân cấp (very good / absolutely essential); tính từ + that-clause / to-V; trạng từ bình luận, quan điểm (surprisingly, financially, admittedly); trạng từ mức độ (barely, considerably, slightly); so sánh kép (the more…, the more…)",
    "Linking and argument", "Liên từ & lập luận: lý do (as, since, given that, due to); mục đích (so as to, with a view to); kết quả (consequently, hence, thus); nhượng bộ (while, whereas, nevertheless, albeit); trạng từ liên kết và dấu câu đi kèm",
    "complement", "thuyết trình, viết đề xuất có lập luận", "presenting and writing well-argued proposals"],
  ["Substitution and ellipsis", "Thay thế & tỉnh lược: so/not (I think so, I hope not); do so / do it / do that; one/ones; tỉnh lược sau trợ động từ (I haven't yet, but I will); tỉnh lược to-V (I'd like to); tỉnh lược sau liên từ (if necessary, when possible)",
    "Information structure and emphasis", "Tổ chức thông tin & nhấn mạnh: câu chẻ It is/was… that; What we need is…; đảo ngữ sau trạng từ phủ định (Never have we…, Not only… but also, Only when…); đưa thành phần lên đầu câu; there/it giới thiệu; danh từ hóa (decide → make a decision)",
    "complement", "viết và nói mạch lạc, nhấn mạnh đúng ý", "writing and speaking coherently with the right emphasis"]
];

const SEEDS: Readonly<Record<CefrLevel, { seeds: readonly Seed[]; firstMonth: number }>> = {
  A1: { seeds: A1_SEEDS, firstMonth: 1 },
  A2: { seeds: A2_SEEDS, firstMonth: 7 },
  B1: { seeds: B1_SEEDS, firstMonth: 13 },
  B2: { seeds: B2_SEEDS, firstMonth: 19 },
  C1: { seeds: C1_SEEDS, firstMonth: 25 }
};

/** Splits a roadmap row "Tên chủ điểm: điểm 1; điểm 2; …" into its title and "Nội dung" list. */
function splitRow(row: string): { titleVi: string; contents: string[] } {
  const colon = row.indexOf(": ");
  if (colon < 0) throw new RangeError(`Grammar roadmap row has no title: ${row}`);
  return { titleVi: row.slice(0, colon).trim(), contents: row.slice(colon + 2).split(/;\s+/u).map((item) => item.trim()).filter(Boolean) };
}

function buildCatalog(cefr: CefrLevel): MonthlyGrammarCatalogPair[] {
  const { seeds, firstMonth } = SEEDS[cefr];
  return seeds.map(([titleEnA, rowA, titleEnB, rowB, pairType, situationVi, situationEn], index) => {
    const id = `${cefr.toLowerCase()}-p${index + 1}`;
    return {
      id, cefr, order: index + 1, roadmapMonth: firstMonth + index, pairType, situationVi, situationEn,
      topicA: { id: `${id}-a`, side: "A", titleEn: titleEnA, ...splitRow(rowA) },
      topicB: { id: `${id}-b`, side: "B", titleEn: titleEnB, ...splitRow(rowB) }
    };
  });
}

const CATALOGS: Readonly<Record<CefrLevel, readonly MonthlyGrammarCatalogPair[]>> = {
  A1: buildCatalog("A1"), A2: buildCatalog("A2"), B1: buildCatalog("B1"), B2: buildCatalog("B2"), C1: buildCatalog("C1")
};

/** The level's six roadmap pairs in roadmap order. */
export function monthlyGrammarCatalog(cefr: CefrLevel): readonly MonthlyGrammarCatalogPair[] {
  return CATALOGS[cefr];
}

/** Topic title stored on the generated topic: roadmap Vietnamese name at A1–A2, English name from B1. */
export function monthlyGrammarTopicTitle(cefr: CefrLevel, topic: MonthlyGrammarCatalogTopic): string {
  return cefr === "A1" || cefr === "A2" ? topic.titleVi : topic.titleEn;
}

const normalizeTitle = (value: string) => value.trim().toLocaleLowerCase("vi").replace(/[\s\p{P}]+/gu, " ").trim();

/** The catalog topic a stored grammar topic teaches (by catalogId, then by exact roadmap title). */
export function findMonthlyGrammarCatalogTopic(cefr: CefrLevel, topic: { title?: string | undefined; catalogId?: string | undefined }): { pair: MonthlyGrammarCatalogPair; topic: MonthlyGrammarCatalogTopic } | undefined {
  const catalog = monthlyGrammarCatalog(cefr);
  for (const pair of catalog) {
    for (const side of [pair.topicA, pair.topicB]) if (topic.catalogId && side.id === topic.catalogId) return { pair, topic: side };
  }
  if (!topic.title?.trim()) return undefined;
  const title = normalizeTitle(topic.title);
  for (const pair of catalog) {
    for (const side of [pair.topicA, pair.topicB]) {
      if (normalizeTitle(side.titleVi) === title || normalizeTitle(side.titleEn) === title) return { pair, topic: side };
    }
  }
  return undefined;
}

/** The roadmap pair of a month's two stored topics, when topic A carries a roadmap catalogId. */
export function monthlyGrammarPairOf(cefr: CefrLevel, topics: ReadonlyArray<{ catalogId?: string | undefined }>): MonthlyGrammarCatalogPair | undefined {
  const [a, b] = topics;
  if (!a?.catalogId) return undefined;
  const found = findMonthlyGrammarCatalogTopic(cefr, { catalogId: a.catalogId });
  if (!found || found.topic.side !== "A" || b?.catalogId !== found.pair.topicB.id) return undefined;
  return found.pair;
}

export const MONTHLY_GRAMMAR_MEMORY_MONTHS = 12;

export interface MonthlyGrammarHistoryEntry {
  /** YYYY-MM of an earlier month of the same level. */
  month: string;
  topics: ReadonlyArray<{ title?: string | undefined; catalogId?: string | undefined }>;
}

export interface MonthlyGrammarSelection {
  pair: MonthlyGrammarCatalogPair;
  /** Pair IDs taught by the same level in the memory window, oldest month first. */
  taughtPairIds: string[];
  /** True when all six pairs were already taught in the window, so a new cycle started. */
  newCycle: boolean;
}

function monthOffset(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (monthNumber - 1) + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Deterministic monthly pick: the next pair in roadmap order after the last
 * pair this level taught in the previous `windowMonths` months, skipping pairs
 * taught inside that window; when every pair was taught (cycle complete), the
 * next pair after the last taught one starts a new cycle. A level with no
 * recognised history starts at the first pair. A month whose topics match no
 * roadmap pair (older free-form months) is ignored.
 */
export function selectMonthlyGrammarPair(input: {
  cefr: CefrLevel;
  month: string;
  history: readonly MonthlyGrammarHistoryEntry[];
  windowMonths?: number;
}): MonthlyGrammarSelection {
  const catalog = monthlyGrammarCatalog(input.cefr);
  const windowStart = monthOffset(input.month, -(input.windowMonths ?? MONTHLY_GRAMMAR_MEMORY_MONTHS));
  const window = input.history
    .filter((entry) => entry.month >= windowStart && entry.month < input.month)
    .sort((a, b) => a.month.localeCompare(b.month));
  const taught = new Set<string>();
  const taughtPairIds: string[] = [];
  let pointer = 0;
  for (const entry of window) {
    const pairs = [...new Set(entry.topics.map((topic) => findMonthlyGrammarCatalogTopic(input.cefr, topic)?.pair).filter((pair): pair is MonthlyGrammarCatalogPair => Boolean(pair)))];
    for (const pair of pairs) {
      if (!taught.has(pair.id)) taughtPairIds.push(pair.id);
      taught.add(pair.id);
      pointer = pair.order % catalog.length;
    }
  }
  const rotated = [...catalog.slice(pointer), ...catalog.slice(0, pointer)];
  const untaught = rotated.find((pair) => !taught.has(pair.id));
  return { pair: untaught ?? rotated[0]!, taughtPairIds, newCycle: !untaught };
}

// ---------------------------------------------------------------------------
// Day framework: N1–N6 topic A, N7–N12 topic B, N13–N15 K1–K3, N16–N18 M1–M3.
// ---------------------------------------------------------------------------

export const MONTHLY_GRAMMAR_DAY_STAGES = [
  "identify", "structure", "variation", "meaning_use", "common_errors", "application",
  "link", "mixed_practice", "workplace_task", "error_review", "long_context", "mock_test"
] as const;
export type MonthlyGrammarDayStage = (typeof MONTHLY_GRAMMAR_DAY_STAGES)[number];

/** Roadmap stage of new-learning day N (1–18). */
export function monthlyGrammarDayStage(n: number): MonthlyGrammarDayStage {
  if (!Number.isInteger(n) || n < 1 || n > 18) throw new RangeError("Grammar day stage needs N1–N18");
  if (n <= 12) return MONTHLY_GRAMMAR_DAY_STAGES[(n - 1) % 6]!;
  return MONTHLY_GRAMMAR_DAY_STAGES[n - 7]!;
}

/** Roadmap step code of new-learning day N: A1–A6, B1–B6, K1–K3, M1–M3. */
export function monthlyGrammarDayCode(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 18) throw new RangeError("Grammar day code needs N1–N18");
  return n <= 6 ? `A${n}` : n <= 12 ? `B${n - 6}` : n <= 15 ? `K${n - 12}` : `M${n - 15}`;
}

/** Roadmap codes taught in a month with `newLessonCount` new-learning days (15–18). */
export function monthlyGrammarMonthCodes(newLessonCount: number): string[] {
  if (!Number.isInteger(newLessonCount) || newLessonCount < 15 || newLessonCount > 18) throw new RangeError("A month has 15–18 new-learning days");
  return Array.from({ length: newLessonCount }, (_, index) => monthlyGrammarDayCode(index + 1));
}

export const MONTHLY_GRAMMAR_STAGE_GUIDE: Readonly<Record<MonthlyGrammarDayStage, { vi: string; en: string; exercise: string; support: string }>> = {
  identify: { vi: "Nhận diện", en: "Identify", exercise: "read a short workplace message or dialogue and choose the sentence that contains the structure", support: "high: highlight the structure and explain it" },
  structure: { vi: "Cấu trúc cơ bản", en: "Basic structure", exercise: "choose the correct answer or fill in the correct form of the main (usually affirmative) form", support: "high: show the model formula" },
  variation: { vi: "Biến thể", en: "Variations", exercise: "transform sentences (negative, question, short or main variant form) or put words in order", support: "medium" },
  meaning_use: { vi: "Ý nghĩa & cách dùng", en: "Meaning and use", exercise: "choose the sentence that fits a situation or match situations to sentences; teach when to use it and its signal words", support: "medium" },
  common_errors: { vi: "Lỗi hay gặp", en: "Common errors", exercise: "find and correct the error or decide true/false, prioritising typical Vietnamese-influenced errors (missing to be, missing -s/-ed, wrong tense because Vietnamese has no tense, articles, prepositions)", support: "low: give a hint when wrong" },
  application: { vi: "Vận dụng", en: "Application", exercise: "complete an open sentence or write 1–2 sentences about the learner's own work, using the day's words when natural", support: "low: only a model sentence for reference" },
  link: { vi: "K1 Nối / phân biệt A–B", en: "K1 Link or contrast A–B", exercise: "contrast pair: choose A or B for each situation; complement or extension pair: join A and B in one sentence", support: "medium" },
  mixed_practice: { vi: "K2 Luyện trộn", en: "K2 Mixed practice", exercise: "one workplace email or message of 4–6 sentences with gaps that need both topic A and topic B", support: "medium" },
  workplace_task: { vi: "K3 Task công sở", en: "K3 Workplace task", exercise: "a workplace situation (for example reporting progress to the manager) where the learner writes 2–3 sentences using both A and B, with a model answer to compare", support: "low: model answer to compare" },
  error_review: { vi: "M1 Sửa lỗi hay gặp", en: "M1 Error review", exercise: "true/false or find-and-correct items on the most common A and B errors", support: "low" },
  long_context: { vi: "M2 Ngữ cảnh dài", en: "M2 Longer context", exercise: "a longer workplace dialogue (6–8 turns) or email, with comprehension questions and choosing the right A/B form", support: "low" },
  mock_test: { vi: "M3 Thi thử", en: "M3 Mock test", exercise: "a short mock in the monthly exam format, with new content (never the real exam items)", support: "none: exam conditions" }
};

// ---------------------------------------------------------------------------
// Coverage gate: every "Nội dung" item must be covered by the topic's steps.
// ---------------------------------------------------------------------------

/** ASCII words in the roadmap rows that are Vietnamese or notation, never English markers. */
const NON_MARKER_TOKENS = new Set([
  "v", "v3", "v-s", "v-ed", "v-ing", "to-v", "o", "sb", "htht", "s", "vs", "vd", "khi", "cho", "theo", "sau", "trong", "con", "danh", "tin", "ba", "gian", "anh", "thi",
  "quy", "ra", "xen", "quen", "suy", "chung", "hay", "sai", "thay", "ty", "lai", "treo", "quan"
]);
/** Very frequent English words: only required when an item has no other English marker. */
const WEAK_TOKENS = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at", "by", "for", "with", "and", "or", "but", "so", "if", "as", "be", "is", "are", "am", "was", "were",
  "i", "you", "he", "she", "it", "we", "they", "me", "my", "do", "does", "did", "not", "no", "have", "has", "had", "will", "would", "can", "that", "this", "there"
]);

function englishTokens(item: string): string[] {
  const tokens = item.replace(/[’]/gu, "'").replace(/…/gu, " ").split(/[\s/(),;:?!.→+=–—]+/u).map((token) => token.trim()).filter(Boolean);
  return tokens.filter((token) => /^(?:-[a-z]+|'s|[a-z][a-z'-]*)$/iu.test(token))
    .map((token) => token.toLocaleLowerCase("en-US").replace(/^'(?!s$)|'$/gu, ""))
    .filter((token) => token && !NON_MARKER_TOKENS.has(token));
}

/**
 * English markers of one "Nội dung" item: the item is covered when the topic
 * text contains ANY strong marker, or — for an item made only of very frequent
 * words (am/is/are, a/an, at/on/in) — ALL of them. Words in parentheses are the
 * roadmap's illustrations and are used only when the item has no strong word
 * outside them. Items with no English marker (purely Vietnamese descriptions)
 * are not checked.
 */
export function monthlyGrammarContentMarkers(item: string): { strong: string[]; weak: string[] } {
  const inside = [...item.matchAll(/\(([^)]*)\)/gu)].map((match) => match[1]!).join(" ");
  const outsideTokens = [...new Set(englishTokens(item.replace(/\([^)]*\)/gu, " ")))];
  const insideTokens = [...new Set(englishTokens(inside))];
  const outsideStrong = outsideTokens.filter((token) => !WEAK_TOKENS.has(token));
  const strong = outsideStrong.length ? outsideStrong : insideTokens.filter((token) => !WEAK_TOKENS.has(token));
  if (strong.length) return { strong, weak: [] };
  return { strong: [], weak: outsideTokens.length ? outsideTokens : insideTokens };
}

function containsMarker(text: string, marker: string): boolean {
  if (marker.startsWith("-") || marker.startsWith("'")) return text.includes(marker);
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![a-z'])${escaped}(?![a-z])`, "u").test(text);
}

export interface MonthlyGrammarCoverageTopic {
  title?: string;
  steps: ReadonlyArray<{ focus?: string; formula?: string; usage?: string; examples?: readonly string[]; dailyObjectives?: readonly string[] | undefined }>;
}

/** "Nội dung" items of the catalog topic that the stored/generated topic does not cover. */
export function monthlyGrammarUncoveredContents(catalogTopic: MonthlyGrammarCatalogTopic, topic: MonthlyGrammarCoverageTopic): string[] {
  const text = [topic.title ?? "", ...topic.steps.flatMap((step) => [step.focus ?? "", step.formula ?? "", step.usage ?? "", ...(step.examples ?? []), ...(step.dailyObjectives ?? [])])]
    .join("\n").replace(/[’]/gu, "'").toLocaleLowerCase("en-US");
  return catalogTopic.contents.filter((item) => {
    const { strong, weak } = monthlyGrammarContentMarkers(item);
    if (strong.length) return !strong.some((marker) => containsMarker(text, marker));
    if (weak.length) return !weak.every((marker) => containsMarker(text, marker));
    return false;
  });
}

/** Coverage issues of a month's two topics against their roadmap pair (empty when not a roadmap month). */
export function monthlyGrammarCoverageIssues(cefr: CefrLevel, topics: ReadonlyArray<MonthlyGrammarCoverageTopic & { id?: string; catalogId?: string | undefined }>): string[] {
  const issues: string[] = [];
  for (const [index, topic] of topics.entries()) {
    if (!topic.catalogId) continue;
    const found = findMonthlyGrammarCatalogTopic(cefr, { catalogId: topic.catalogId });
    if (!found) { issues.push(`Grammar topic ${topic.id ?? index + 1} has an unknown roadmap catalogId ${topic.catalogId}`); continue; }
    const missing = monthlyGrammarUncoveredContents(found.topic, topic);
    if (missing.length) issues.push(`Grammar topic ${topic.id ?? index + 1} (${found.topic.titleEn}) does not cover roadmap content: ${missing.map((item) => `"${item}" (use ${describeMarkers(item)})`).join("; ")}`);
  }
  return issues;
}

function describeMarkers(item: string): string {
  const { strong, weak } = monthlyGrammarContentMarkers(item);
  return strong.length ? `at least one of: ${strong.join(", ")}` : `all of: ${weak.join(", ")}`;
}

// ---------------------------------------------------------------------------
// A1–A2 grammar example translations (product decision 12/11): each English
// example has a short Vietnamese translation in `exampleTranslations` (same
// order), shown as a popup only. Audio/TTS reads the English example only, so
// an example must never contain Vietnamese. B1+ has no translations.
// ---------------------------------------------------------------------------

export const MONTHLY_GRAMMAR_EXAMPLE_TRANSLATION_MAX_CHARS = 160;
const VIETNAMESE_TEXT = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹàáèéìíòóùúý]/iu;

/** Problems with a grammar part's examples/exampleTranslations for the level (empty when fine). */
export function monthlyGrammarExampleTranslationIssues(cefr: CefrLevel, examples: readonly unknown[], translations: unknown): string[] {
  const issues: string[] = [];
  const englishExamples = examples.filter((example): example is string => typeof example === "string" && Boolean(example.trim()));
  const spokenVietnamese = englishExamples.filter((example) => VIETNAMESE_TEXT.test(example));
  if (spokenVietnamese.length) issues.push(`grammar.examples are read aloud in English: move the Vietnamese out of "${spokenVietnamese[0]!.slice(0, 80)}"${cefr === "A1" || cefr === "A2" ? " into grammar.exampleTranslations" : ""}`);
  const list = Array.isArray(translations) ? translations : undefined;
  if (cefr !== "A1" && cefr !== "A2") {
    if (list?.some((item) => typeof item === "string" && item.trim())) issues.push(`grammar.exampleTranslations must be omitted at ${cefr} (no Vietnamese translations from B1)`);
    return issues;
  }
  if (!examples.length && !list?.length) return issues;
  if (!list || list.length !== examples.length) {
    issues.push(`grammar.exampleTranslations must give one short Vietnamese translation per grammar.examples sentence, same order (${examples.length} expected, received ${list?.length ?? 0})`);
    return issues;
  }
  list.forEach((item, index) => {
    const value = typeof item === "string" ? item.trim() : "";
    if (!value || !VIETNAMESE_TEXT.test(value)) issues.push(`grammar.exampleTranslations[${index}] must be a Vietnamese translation of example ${index + 1}`);
    else if (value.length > MONTHLY_GRAMMAR_EXAMPLE_TRANSLATION_MAX_CHARS) issues.push(`grammar.exampleTranslations[${index}] must be short (at most ${MONTHLY_GRAMMAR_EXAMPLE_TRANSLATION_MAX_CHARS} characters)`);
  });
  return issues;
}

/**
 * B1–C1: removes grammar `exampleTranslations` (on the part and on each step). Translations of grammar
 * examples are A1–A2 only and the learner app never shows them from B1, so generation and manual saves
 * drop any the model or an old draft still carries (13/11: a B1 review kept them and failed English-only).
 */
export function withoutAdvancedGrammarExampleTranslations<T extends { code: string; content?: unknown }>(cefr: string, parts: readonly T[]): T[] {
  if (cefr === "A1" || cefr === "A2") return [...parts];
  const strip = (value: unknown): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const { exampleTranslations: _dropped, ...rest } = value as Record<string, unknown>;
    return Array.isArray(rest.steps) ? { ...rest, steps: rest.steps.map(strip) } : rest;
  };
  return parts.map((part) => part.code === "grammar" && part.content && typeof part.content === "object" ? { ...part, content: strip(part.content) } as T : part);
}
