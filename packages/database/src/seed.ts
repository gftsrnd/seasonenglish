import type { Client } from "pg";
import { finalDefinition, levelUpDefinition, placementDefinition } from "./assessment-blueprints.js";
import { prototypePromptDefaults } from "./prototype-prompts.js";
import { planCanonicalPromptPublication } from "./prompt-sync.js";

export const DEMO_IDS = {
  organization: "00000000-0000-4000-8000-000000000001",
  learner: "00000000-0000-4000-8000-000000000101",
  operator: "00000000-0000-4000-8000-000000000102",
  manager: "00000000-0000-4000-8000-000000000103",
  checker: "00000000-0000-4000-8000-000000000104",
  program: "00000000-0000-4000-8000-000000000201",
  week: "00000000-0000-4000-8000-000000000301",
  week2: "00000000-0000-4000-8000-000000000302",
  lessonSet: "00000000-0000-4000-8000-000000000401",
  publishedLessonSetVersion: "00000000-0000-4000-8000-000000000501",
  lessons: [
    "00000000-0000-4000-8000-000000000601",
    "00000000-0000-4000-8000-000000000602",
    "00000000-0000-4000-8000-000000000603",
    "00000000-0000-4000-8000-000000000604",
    "00000000-0000-4000-8000-000000000605"
  ],
  lessonVersions: [
    "00000000-0000-4000-8000-000000000701",
    "00000000-0000-4000-8000-000000000702",
    "00000000-0000-4000-8000-000000000703",
    "00000000-0000-4000-8000-000000000704",
    "00000000-0000-4000-8000-000000000705"
  ],
  progress: "00000000-0000-4000-8000-000000000801",
  activity: "00000000-0000-4000-8000-000000000811",
  badge: "00000000-0000-4000-8000-000000000821",
  reward: "00000000-0000-4000-8000-000000000831",
  microLesson: "00000000-0000-4000-8000-000000000841",
  coachSession: "00000000-0000-4000-8000-000000000851",
  practiceSubmission: "00000000-0000-4000-8000-000000000861",
  gameSet: "00000000-0000-4000-8000-000000000862",
  placementDefinition: "00000000-0000-4000-8000-000000000871",
  placementVersion: "00000000-0000-4000-8000-000000000872",
  placementAttempt: "00000000-0000-4000-8000-000000000873",
  finalDefinition: "00000000-0000-4000-8000-000000000881",
  finalVersion: "00000000-0000-4000-8000-000000000882",
  levelUpDefinition: "00000000-0000-4000-8000-000000000891",
  levelUpVersion: "00000000-0000-4000-8000-000000000892"
} as const;

const badgeCatalog = [
  ["00000000-0000-4000-8000-000000000821", "starter", "Khởi động", "Hoàn thành bài học đầu tiên", 2],
  ["00000000-0000-4000-8000-000000000822", "streak3", "Chuỗi 3 ngày", "Học 3 ngày liên tiếp từ T2–T6", 2],
  ["00000000-0000-4000-8000-000000000823", "week_complete", "Tuần trọn vẹn", "Hoàn thành toàn bộ bài trong một tuần", 3],
  ["00000000-0000-4000-8000-000000000824", "friday", "Đúng hẹn thứ Sáu", "Nộp bài thực hành tuần đúng hạn", 3],
  ["00000000-0000-4000-8000-000000000825", "coach_friend", "Bạn của Season", "Hoàn thành 10 lượt luyện với Season", 3],
  ["00000000-0000-4000-8000-000000000826", "streak5", "Chuỗi 5 ngày", "Học đủ 5 ngày trong tuần", 4],
  ["00000000-0000-4000-8000-000000000827", "first_try", "Chuẩn ngay lần đầu", "Bốn kỹ năng đúng ở lần thử đầu", 4],
  ["00000000-0000-4000-8000-000000000828", "wordsmith", "Thợ mở khoá", "Mở đủ ô từ bí mật với Season", 4]
] as const;

const lessonTitles = [
  "I work in… as…",
  "Past simple: I joined…",
  "What do you do?",
  "I am working on…",
  "be going to + verb"
] as const;

const weeklyLessonsPrompt = `Chỉ trả về JSON hợp lệ, không bọc markdown, không giải thích.
Bạn là người thiết kế bài học tiếng Anh công sở cho Season English. Tạo đúng 5 bài cho tuần được cung cấp, tương ứng dayNumber 1, 2, 3, 4, 5 (T2 đến T6). Cả 5 bài dùng cùng chủ đề tuần nhưng mỗi ngày phải dạy một mẫu câu, cấu trúc hoặc kỹ năng khác nhau, đi từ dễ đến khó, không lặp lại. Nếu input có plan gồm 5 mục thì plan là kế hoạch đã được operator duyệt: dùng từng mục làm trọng tâm của đúng ngày đó, không tự thay bằng chủ đề tuần khác và không bỏ qua mục nào.

Nguyên tắc theo mức CEFR và ngôn ngữ:
- Bám chặt cefr, topic, description, objectives và keyVocabHint trong input. Nội dung phải thực tế, liên quan công việc và phù hợp với người học Việt Nam.
- A1–A2: phần giải thích, hướng dẫn và phản hồi bằng tiếng Việt; câu và từ tiếng Anh giữ nguyên. B1 trở lên: phần giải thích bằng tiếng Anh, trừ khi input yêu cầu khác.
- Tiêu đề phải là MẪU CÂU cụ thể của đúng ngày để người học biết mình sẽ nói gì, tối đa 6 từ; ví dụ "It is + adjective", "Could I + V?", "I work in… as…". Không dùng công thức chung chung như "S + V" hoặc "S + V + O", không lặp cùng tiêu đề cho nhiều ngày, không viết tên hoạt động như "Talking about..."; không dùng dấu chấm cuối và không đặt chủ đề tuần làm tiêu đề. durationMinutes là 5, 10, 15 hoặc 20.
- Không dùng placeholder, dữ liệu giả kiểu “...” hoặc nội dung chung chung. Mọi content đều là tài liệu người học có thể đọc, nghe, nói hoặc làm ngay.

Mỗi lesson phải có đúng một lần 11 part code sau, theo đúng thứ tự này: objective, instruction, vocabulary, grammar, pronunciation, listening, reading, writing, word_class, word_use, speaking. Không đổi tên key, không dùng schema prototype cũ như day/theory/examples/vocab/pron.

Quy tắc nội dung từng part:
1. objective: content.text là đúng 1 câu cụ thể, đo được, tối đa 16 từ; đi thẳng vào kỹ năng, không mở đầu bằng “Sau bài học, bạn có thể”.
2. instruction: content.steps là danh sách 3–5 bước ngắn: học nội dung, làm lần lượt bài tập, kiểm tra/hoàn thành. Viết rõ ràng theo mức CEFR.
3. vocabulary: content.items có đúng 3 từ hoặc cụm từ cần cho mẫu câu. Mỗi item có word, pronunciation (IPA), meaning, imageQuery là truy vấn tiếng Anh ngắn mô tả một ảnh chụp công sở có vật/hành động mục tiêu rõ ràng; cấm URL, emoji, icon, logo, sơ đồ, biểu đồ, screenshot hoặc ảnh nhiều chữ. collocations đúng 3 cụm thông dụng dài 2–5 từ có chứa nguyên từ đó, family tối đa 2 mục, umbrella có tối đa 2 siblings, synonyms tối đa 2 mục và antonyms tối đa 2 mục; mỗi quan hệ chỉ cần word + level/note ngắn. Không bịa imageUrl hoặc nguồn ảnh; hệ thống sẽ tự tìm và kiểm duyệt ảnh từ provider có attribution. Mỗi từ phải xuất hiện trong ví dụ của bài; không dùng tên người, công ty, quốc gia, thành phố hay địa danh làm từ vựng hoặc đáp án.
4. grammar: content.formula là công thức có đủ thành phần; content.usage nói khi nào dùng; content.examples là 2–3 câu tiếng Anh hoàn chỉnh, dùng từ vựng của bài. A1–A2 có nghĩa tiếng Việt ngắn nếu cần. Không ghi kế hoạch thay cho nội dung dạy.
5. pronunciation: content.focus là một âm mục tiêu duy nhất, content.tip là hướng dẫn phát âm, content.words là đúng 3 object {word,ipa}; cả 3 IPA phải thật sự chứa âm mục tiêu.
6. listening: content.audio là đoạn tiếng Anh 15–30 từ để máy đọc, content.prompt là một câu hỏi tiếng Anh, content.options là đúng 4 lựa chọn tiếng Anh, content.answer là nguyên văn đúng 1 lựa chọn. Nội dung phải khác reading.
7. reading: content.text là đoạn tiếng Anh 2–4 câu, content.prompt là câu hỏi, content.options là đúng 4 lựa chọn, content.answer là nguyên văn đúng 1 lựa chọn. B1 trở lên phải hỏi suy luận, không chép nguyên đáp án từ đoạn đọc.
8. writing: content.type là fill, mcq hoặc write. Fill chỉ có một chỗ trống và gợi ý nghĩa ngay sau chỗ trống; mcq có đúng 4 lựa chọn và một đáp án; write yêu cầu viết 1–2 câu theo mẫu và có một câu mẫu tham khảo. Chỉ dùng mẫu câu và từ vựng của bài.
9. word_class: content.prompt hỏi từ loại của một từ trong câu tiếng Anh của bài, content.options đúng 4 lựa chọn noun/verb/adjective/adverb, content.answer trùng nguyên văn một lựa chọn.
10. word_use: content.prompt hỏi câu nào dùng đúng một từ vựng của bài, content.options đúng 4 câu tiếng Anh, content.answer trùng nguyên văn một lựa chọn.
11. speaking: content.prompt là yêu cầu nói bằng ngôn ngữ giải thích, content.answer là đúng một câu tiếng Anh mẫu dài 6–14 từ, dùng mẫu câu và ít nhất một từ vựng của bài.

Các câu trắc nghiệm phải có đúng 4 lựa chọn, chỉ một đáp án đúng; lựa chọn sai phải sai rõ về nghĩa hoặc ngữ pháp nhưng vẫn cùng ngữ cảnh. Không Việt hoá lựa chọn tiếng Anh. Bắt buộc đủ cả 11 part và không để content trống. Phần Nghe phải luôn có audio dạng text để nút máy đọc hoạt động; không được bỏ audio chỉ vì không có file mp3.

JSON bắt buộc có đúng dạng:
{"lessons":[{"dayNumber":1,"title":"...","durationMinutes":10,"parts":[{"code":"objective","title":"Mục tiêu bài học","content":{"text":"..."}},{"code":"instruction","title":"Hướng dẫn làm bài","content":{"steps":["...","...","..."]}},{"code":"vocabulary","title":"Từ vựng","content":{"items":[{"word":"...","pronunciation":"/.../","meaning":"...","imageQuery":"real office object photo","collocations":["...","...","..."],"family":[{"word":"...","type":"noun","meaning":"..."}],"umbrella":{"word":"...","meaning":"...","siblings":[]},"synonyms":[{"word":"...","level":"B1","note":"..."}],"antonyms":[]}]}},{"code":"grammar","title":"Ngữ pháp","content":{"formula":"S + V + O","usage":"...","examples":["...","..."]}},{"code":"pronunciation","title":"Phát âm","content":{"focus":"...","tip":"...","words":[{"word":"...","ipa":"/.../"},{"word":"...","ipa":"/.../"},{"word":"...","ipa":"/.../"}]}},{"code":"listening","title":"Nghe","content":{"audio":"...","prompt":"...","options":["...","...","...","..."],"answer":"..."}},{"code":"reading","title":"Đọc","content":{"text":"...","prompt":"...","options":["...","...","...","..."],"answer":"..."}},{"code":"writing","title":"Viết","content":{"type":"fill","prompt":"...","options":[],"answer":"..."}},{"code":"word_class","title":"Từ loại","content":{"prompt":"...","options":["noun","verb","adjective","adverb"],"answer":"noun"}},{"code":"word_use","title":"Dùng từ","content":{"prompt":"...","options":["...","...","...","..."],"answer":"..."}},{"code":"speaking","title":"Nói","content":{"prompt":"...","answer":"..."}}]}]}
Mỗi lesson phải đủ nội dung learner-facing để màn Học hiển thị mục tiêu, hướng dẫn, từ vựng, ngữ pháp, phát âm và màn Bài tập hiển thị Nghe/Đọc/Viết/Từ loại/Dùng từ/Nói; giữ câu trả lời ngắn, không lặp lại giải thích, tổng output vừa đủ để 5 bài nằm trong giới hạn token.`;

const promptDefaults = [
  ["00000000-0000-4000-8000-000000001001", "system_rules", prototypePromptDefaults.base],
  ["00000000-0000-4000-8000-000000001002", "assessment_scoring", prototypePromptDefaults.placement],
  ["00000000-0000-4000-8000-000000001003", "weekly_lessons", weeklyLessonsPrompt],
  ["00000000-0000-4000-8000-000000001004", "week_suggestions", prototypePromptDefaults.weeks],
  ["00000000-0000-4000-8000-000000001005", "micro_grading", prototypePromptDefaults.mgrade],
  ["00000000-0000-4000-8000-000000001006", "coach_dialogue", prototypePromptDefaults.coach],
  ["00000000-0000-4000-8000-000000001007", "weekly_practice_grading", prototypePromptDefaults.grade],
  ["00000000-0000-4000-8000-000000001008", "vocabulary_generation", "Return valid JSON only. Create exactly 15 useful workplace-English words or short phrases for the requested topic and CEFR level. Give a stable lowercase id, English form, concise Vietnamese meaning, simple English definition and one partOfSpeech from noun, verb, adjective, adverb, preposition or phrase. Avoid duplicates and unsafe or irrelevant content."],
  ["00000000-0000-4000-8000-000000001009", "micro_lesson_generation", "Return valid JSON only. Create one short personalized workplace-English micro lesson for the learner. It must fit the supplied CEFR, weekly topic, goals, work context, preferred learning style and duration. Include a concise explanation, 3-5 useful vocabulary items and one answerable practice task. For mcq include 2-5 options and the correct answer; otherwise include a clear reference answer. Never use placeholder content."]
] as const;

const lessonStudyContent = [
  {
    objective: "Giới thiệu được tên, vai trò và nhóm làm việc bằng 3–4 câu ngắn.",
    vocabulary: [
      {
        word: "colleague", type: "danh từ", pronunciation: "/ˈkɒliːɡ/", meaning: "đồng nghiệp", examples: ["my colleague", "a new colleague"],
        family: [
          { word: "colleague", type: "noun", meaning: "đồng nghiệp", pronunciation: "/ˈkɒliːɡ/" },
          { word: "collegial", type: "adjective", meaning: "thân thiện như đồng nghiệp", pronunciation: "/kəˈliːdʒəl/" }
        ],
        synonyms: [
          { word: "coworker", level: "A2", note: "dùng trong giao tiếp công việc", pronunciation: "/ˈkəʊwɜːkə(r)/" },
          { word: "associate", level: "B1", note: "trang trọng hơn", pronunciation: "/əˈsəʊsiət/" }
        ],
        umbrella: {
          word: "people at work", meaning: "những người trong môi trường làm việc",
          siblings: [
            { word: "manager", meaning: "quản lý", pronunciation: "/ˈmænɪdʒə(r)/" },
            { word: "client", meaning: "khách hàng", pronunciation: "/ˈklaɪənt/" }
          ]
        },
        lexicalDetails: [
          { kind: "synonym", word: "coworker", definition: "a person you work with", example: "My coworker joined the call.", context: "workplace", note: "common", source: "published-lesson" },
          { kind: "antonym", word: "competitor", definition: "a person or company competing with you", example: "The competitor launched a new service.", context: "business", note: "contrast", source: "published-lesson" },
          { kind: "slang", word: "workmate", definition: "a colleague", context: "informal", source: "published-lesson" },
          { kind: "poetic", word: "fellow worker", definition: "a person sharing your work", note: "literary", source: "published-lesson" }
        ]
      },
      { word: "role", type: "danh từ", pronunciation: "/rəʊl/", meaning: "vai trò", examples: ["my role", "project role"] },
      { word: "work with", type: "cụm từ", pronunciation: "/wɜːk wɪð/", meaning: "làm việc cùng", examples: ["I work with the AI team."] }
    ],
    grammar: { formula: "I am + vai trò · I work with + nhóm", usage: "Dùng be để nói vai trò và work with để nói nhóm cộng tác.", examples: ["I am an AI intern.", "I work with the product team."] },
    pronunciation: { focus: "/wɜː/", instruction: "Giữ âm giữa dài và không đọc thành âm /o/.", words: ["work", "worker", "working"] },
    listening: {
      script: "Good morning. I am Binh. I work in sales and I am in charge of customer emails.",
      prompt: "What is Binh in charge of?",
      options: ["Customer emails", "Sales", "Marketing", "The website"],
      answer: "Customer emails"
    },
    reading: {
      text: "This is my colleague, Mai. She works in marketing as a designer. She is in charge of our website.",
      prompt: "What is Mai in charge of?",
      options: ["Customer emails", "Our website", "Sales reports", "The marketing team"],
      answer: "Our website"
    },
    writing: { prompt: "Viết 3–4 câu giới thiệu phòng ban, vai trò và một việc bạn phụ trách." },
    wordClass: {
      prompt: "Trong câu ‘This is my colleague, Mai.’, từ ‘colleague’ thuộc từ loại nào?",
      options: ["noun", "verb", "adjective", "adverb"],
      answer: "noun"
    },
    wordUse: {
      prompt: "Which sentence uses ‘colleague’ correctly?",
      options: [
        "This is my colleague, Mai.",
        "This is my colleague Mai is.",
        "I colleague with Mai.",
        "Mai is very colleague."
      ],
      answer: "This is my colleague, Mai."
    },
    speaking: {
      prompt: "Nói to câu sau:",
      answer: "I work in sales and I am in charge of customer emails.",
      modelAnswer: "I work in sales and I am in charge of customer emails."
    }
  },
  {
    objective: "Hỏi và trả lời được mình đến từ đâu trong một cuộc làm quen ngắn.",
    vocabulary: [
      {
        word: "new", type: "tính từ", pronunciation: "/njuː/", meaning: "mới", examples: ["new here", "a new job", "a new team"],
        family: [
          { word: "newly", type: "adverb", meaning: "mới đây, vừa mới", pronunciation: "/ˈnjuːli/" },
          { word: "newness", type: "noun", meaning: "tính mới mẻ", pronunciation: "/ˈnjuːnəs/" }
        ],
        synonyms: [
          { word: "recent", level: "A2", note: "xảy ra hoặc xuất hiện gần đây", pronunciation: "/ˈriːsənt/" },
          { word: "modern", level: "A2", note: "mới và phù hợp với hiện tại", pronunciation: "/ˈmɒdən/" }
        ],
        lexicalDetails: [
          { kind: "synonym", word: "recent", definition: "having happened or appeared not long ago", example: "This is a recent project.", context: "workplace", source: "published-lesson" },
          { kind: "antonym", word: "old", definition: "having existed for a long time", example: "This is an old process.", context: "workplace", source: "published-lesson" }
        ]
      },
      {
        word: "nice", type: "tính từ", pronunciation: "/naɪs/", meaning: "vui, dễ chịu", examples: ["nice to meet you", "a nice team"],
        family: [
          { word: "nicely", type: "adverb", meaning: "một cách dễ chịu", pronunciation: "/ˈnaɪsli/" },
          { word: "niceness", type: "noun", meaning: "sự dễ chịu, tử tế", pronunciation: "/ˈnaɪsnəs/" }
        ],
        synonyms: [
          { word: "pleasant", level: "A2", note: "dễ chịu hoặc thân thiện", pronunciation: "/ˈplezənt/" },
          { word: "friendly", level: "A2", note: "thân thiện với người khác", pronunciation: "/ˈfrendli/" }
        ],
        lexicalDetails: [
          { kind: "synonym", word: "pleasant", definition: "friendly, enjoyable, or satisfying", example: "It was a pleasant meeting.", context: "workplace", source: "published-lesson" },
          { kind: "antonym", word: "unpleasant", definition: "not enjoyable or friendly", example: "The delay was unpleasant.", context: "workplace", source: "published-lesson" }
        ]
      },
      {
        word: "from", type: "giới từ", pronunciation: "/frɒm/", meaning: "từ, đến từ", examples: ["from Hue", "from Vietnam", "from my team"],
        umbrella: {
          word: "prepositions of origin", meaning: "giới từ chỉ nơi bắt đầu, nguồn gốc hoặc điểm xuất phát",
          siblings: [
            { word: "to", type: "preposition", meaning: "đến, tới", pronunciation: "/tuː/" },
            { word: "in", type: "preposition", meaning: "ở trong, tại", pronunciation: "/ɪn/" }
          ]
        },
        lexicalDetails: [
          { kind: "synonym", word: "out of", definition: "starting at or coming from a place", example: "She is from out of town.", context: "origin", note: "dùng trong một số ngữ cảnh cụ thể", source: "published-lesson" }
        ]
      }
    ],
    grammar: { formula: "Where are you from? · I am from + nơi", usage: "Dùng khi làm quen và hỏi nguồn gốc hoặc nơi sinh sống.", examples: ["I am from Hue.", "Nice to meet you.", "I am new here."] },
    pronunciation: { focus: "/aɪ/", instruction: "Mở rộng miệng ở âm /a/ rồi lướt nhanh sang /ɪ/.", words: ["I", "nice", "time"] },
    listening: {
      script: "I joined GFT in 2023. Last year I worked on a banking project.",
      prompt: "When did the speaker join GFT?",
      options: ["In 2023", "In 2022", "In 2024", "Last year"],
      answer: "In 2023"
    },
    reading: {
      text: "Hoa joined the team in March. She worked on a new project and finished it in June.",
      prompt: "When did Hoa finish the project?",
      options: ["In March", "In June", "In May", "Last year"],
      answer: "In June"
    },
    writing: { prompt: "Viết 3–4 câu kể về lúc bạn gia nhập nhóm hoặc hoàn thành một dự án." },
    wordClass: {
      prompt: "Trong câu ‘I joined GFT in 2024.’, từ ‘joined’ thuộc từ loại nào?",
      options: ["verb", "noun", "adjective", "adverb"],
      answer: "verb"
    },
    wordUse: {
      prompt: "Which sentence uses ‘join’ correctly?",
      options: [
        "I joined the team in May.",
        "I joined in the team in May.",
        "I was join the team in May.",
        "The team joined me very."
      ],
      answer: "I joined the team in May."
    },
    speaking: {
      prompt: "Nói to câu sau:",
      answer: "I joined GFT in 2024 and worked on a big project.",
      modelAnswer: "I joined GFT in 2024 and worked on a big project."
    }
  },
  {
    objective: "Mô tả được 2–3 công việc thường làm trong một ngày.",
    vocabulary: [
      { word: "prepare", type: "động từ", pronunciation: "/prɪˈpeə/", meaning: "chuẩn bị", examples: ["prepare a report"] },
      { word: "review", type: "động từ", pronunciation: "/rɪˈvjuː/", meaning: "xem lại", examples: ["review the data"] },
      { word: "usually", type: "trạng từ", pronunciation: "/ˈjuːʒuəli/", meaning: "thường xuyên", examples: ["I usually check email."] }
    ],
    grammar: { formula: "I usually + động từ · I + động từ + every day", usage: "Dùng hiện tại đơn để mô tả công việc lặp lại.", examples: ["I prepare reports every day.", "I usually review the data."] },
    pronunciation: { focus: "/juː/", instruction: "Bắt đầu nhẹ bằng /j/ rồi kéo dài âm /uː/.", words: ["usually", "you", "review"] },
    listening: {
      script: "What do you do? I am in sales. I report to the sales manager.",
      prompt: "Who does the speaker report to?",
      options: ["The sales manager", "The QA manager", "The product manager", "A client"],
      answer: "The sales manager"
    },
    reading: {
      text: "Minh is a tester. He reports to the QA manager. His deadline is Friday.",
      prompt: "When is Minh's deadline?",
      options: ["Monday", "Wednesday", "Friday", "Next week"],
      answer: "Friday"
    },
    writing: { prompt: "Viết 3–4 câu mô tả công việc hiện tại, người bạn báo cáo và một hạn chót." },
    wordClass: {
      prompt: "Trong câu ‘The deadline is Friday.’, từ ‘deadline’ thuộc từ loại nào?",
      options: ["noun", "verb", "adjective", "adverb"],
      answer: "noun"
    },
    wordUse: {
      prompt: "Which sentence uses ‘deadline’ correctly?",
      options: [
        "The deadline is Friday.",
        "The deadline are Friday.",
        "We deadline on Friday.",
        "Friday is very deadline."
      ],
      answer: "The deadline is Friday."
    },
    speaking: {
      prompt: "Nói to câu sau:",
      answer: "I report to the sales manager.",
      modelAnswer: "I report to the sales manager."
    }
  },
  {
    objective: "Hỏi lại lịch sự khi chưa nghe rõ hoặc chưa hiểu một yêu cầu.",
    vocabulary: [
      { word: "repeat", type: "động từ", pronunciation: "/rɪˈpiːt/", meaning: "nhắc lại", examples: ["repeat that, please"] },
      { word: "mean", type: "động từ", pronunciation: "/miːn/", meaning: "có nghĩa là", examples: ["What do you mean?"] },
      { word: "clarify", type: "động từ", pronunciation: "/ˈklærəfaɪ/", meaning: "làm rõ", examples: ["Could you clarify that?"] }
    ],
    grammar: { formula: "Could you + động từ, please?", usage: "Dùng could để hỏi lại lịch sự trong công việc.", examples: ["Could you repeat that, please?", "Could you clarify the deadline?"] },
    pronunciation: { focus: "/iː/", instruction: "Kéo dài âm /iː/ và giữ môi hơi ngang.", words: ["repeat", "mean", "please"] },
    listening: {
      script: "Hi team. This week I am testing the mobile app. Nam is writing the update.",
      prompt: "Who is writing the update?",
      options: ["Nam", "Mai", "The speaker", "The manager"],
      answer: "Nam"
    },
    reading: {
      text: "We are working on a new website. This week Mai is testing it.",
      prompt: "What is Mai doing this week?",
      options: ["Writing an update", "Testing the website", "Calling the client", "Planning the week"],
      answer: "Testing the website"
    },
    writing: { prompt: "Viết 3–4 câu cập nhật việc bạn đang làm trong tuần này." },
    wordClass: {
      prompt: "Trong câu ‘She is writing the update.’, từ ‘update’ thuộc từ loại nào?",
      options: ["noun", "verb", "adjective", "adverb"],
      answer: "noun"
    },
    wordUse: {
      prompt: "Which sentence uses ‘update’ correctly?",
      options: [
        "She is writing a short update.",
        "She is update a short.",
        "She updates is short.",
        "She is writing an update short very."
      ],
      answer: "She is writing a short update."
    },
    speaking: {
      prompt: "Nói to câu sau:",
      answer: "I am working on a new website this week.",
      modelAnswer: "I am working on a new website this week."
    }
  },
  {
    objective: "Tóm tắt được nội dung chính và đề xuất một bước tiếp theo rõ ràng.",
    vocabulary: [
      { word: "summary", type: "danh từ", pronunciation: "/ˈsʌməri/", meaning: "bản tóm tắt", examples: ["a short summary"] },
      { word: "action item", type: "cụm danh từ", pronunciation: "/ˈækʃən ˌaɪtəm/", meaning: "việc cần làm", examples: ["confirm the action items"] },
      { word: "next step", type: "cụm danh từ", pronunciation: "/nekst step/", meaning: "bước tiếp theo", examples: ["agree on the next step"] }
    ],
    grammar: { formula: "To summarise, ... · Next, we will + động từ", usage: "Dùng để kết thúc cuộc trao đổi và xác nhận hành động tiếp theo.", examples: ["To summarise, the report is ready.", "Next, we will review it."] },
    pronunciation: { focus: "/st st/", instruction: "Nối hai cụm phụ âm trong next step, không thêm nguyên âm ở giữa.", words: ["next step", "first step", "last step"] },
    listening: {
      script: "Tomorrow I am going to call the client. Then we are going to plan the week.",
      prompt: "Who is the speaker going to call tomorrow?",
      options: ["The client", "The manager", "Mai", "The sales team"],
      answer: "The client"
    },
    reading: {
      text: "Next week our client is going to visit the office. We are going to plan a short meeting.",
      prompt: "Who is going to visit the office next week?",
      options: ["Our client", "The manager", "Mai", "The QA team"],
      answer: "Our client"
    },
    writing: { prompt: "Viết 3–4 câu về kế hoạch công việc của bạn cho ngày mai hoặc tuần tới." },
    wordClass: {
      prompt: "Trong câu ‘I am going to call the client tomorrow.’, từ ‘client’ thuộc từ loại nào?",
      options: ["noun", "verb", "adjective", "adverb"],
      answer: "noun"
    },
    wordUse: {
      prompt: "Which sentence uses ‘client’ correctly?",
      options: [
        "I am going to meet the client tomorrow.",
        "I am going to client tomorrow.",
        "The client is very clienting.",
        "I am going to meet to the client tomorrow."
      ],
      answer: "I am going to meet the client tomorrow."
    },
    speaking: {
      prompt: "Nói to câu sau:",
      answer: "I am going to call the client tomorrow.",
      modelAnswer: "I am going to call the client tomorrow."
    }
  }
] as const;

function lessonContent(dayNumber: number, title: string) {
  const study = lessonStudyContent[dayNumber - 1] ?? lessonStudyContent[0];
  const text = study.objective;
  return {
    durationMinutes: 10,
    parts: [
      { code: "objective", title: "Mục tiêu bài học", content: { text } },
      { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Học nội dung", "Làm lần lượt các bài tập", "Xem phản hồi và làm lại"] } },
      { code: "vocabulary", title: "Từ vựng", content: { items: study.vocabulary } },
      { code: "grammar", title: "Ngữ pháp", content: study.grammar },
      { code: "pronunciation", title: "Phát âm", content: study.pronunciation },
      { code: "listening", title: "Nghe", content: study.listening },
      { code: "reading", title: "Đọc", content: study.reading },
      { code: "writing", title: "Viết", content: study.writing },
      { code: "word_class", title: "Từ loại", content: study.wordClass },
      { code: "word_use", title: "Dùng từ", content: study.wordUse },
      { code: "speaking", title: "Nói", content: study.speaking }
    ]
  };
}

export type SeedDemoMode = "local" | "test";

export async function seedDemo(client: Client, options: { mode?: SeedDemoMode } = {}): Promise<void> {
  const mode = options.mode ?? "test";
  await client.query(
    `insert into organizations (id, name, slug)
     values ($1, 'GFT Demo', 'gft-demo')
     on conflict (id) do nothing`,
    [DEMO_IDS.organization]
  );

  const users = [
    [DEMO_IDS.learner, "learner", "Học viên Demo", "learner@e4s.local"],
    [DEMO_IDS.operator, "operator", "Thư Demo", "operator@e4s.local"],
    [DEMO_IDS.manager, "manager", "Quản lý Demo", "manager@e4s.local"],
    ...(mode === "test"
      ? [[DEMO_IDS.checker, "operator", "Minh Checker", "checker@e4s.local"]] as const
      : [])
  ] as const;
  for (const user of users) {
    await client.query(
      `insert into users (id, organization_id, role, display_name, email)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update set
         organization_id = excluded.organization_id,
         role = excluded.role,
         display_name = excluded.display_name,
         email = excluded.email,
         status = 'active',
         updated_at = now()`,
      [user[0], DEMO_IDS.organization, user[1], user[2], user[3]]
    );
  }

  await client.query(
    `insert into learner_profiles (user_id, profile, completed_at)
     values ($1, $2::jsonb, now())
     on conflict (user_id) do update set profile = case
       when learner_profiles.profile ? 'avatar' then learner_profiles.profile
       else learner_profiles.profile || jsonb_build_object('avatar', excluded.profile->'avatar')
     end`,
    [DEMO_IDS.learner, JSON.stringify({
      fullName: "Học viên Demo",
      email: "learner@e4s.local",
      department: "AI",
      position: "AI Intern",
      contact: "",
      goals: ["meeting", "email"],
      environmentUse: "weekly",
      familyUse: "none",
      habits: ["podcast", "documents"],
      situations: "Họp daily với nhóm quốc tế",
      learningStyles: ["speaking", "examples"],
      explanationLanguage: "auto",
      persona: "informal",
      durationMinutes: 10,
      device: "both",
      selfLevel: "A2",
      certificates: [],
      experience: "Học ở trường",
      concerns: "Muốn nói rõ hơn trong cuộc họp",
      avatar: { color: "olive", acc: "sun", bg: 2 }
    })]
  );
  await client.query(
    `insert into programs (id, organization_id, name, start_date, week_count, current_week_override, status)
     values ($1, $2, 'E4S Pilot', (current_date - (extract(isodow from current_date)::int - 1)), 2, null, 'active')
     on conflict (id) do update set start_date = excluded.start_date, week_count = excluded.week_count,
       current_week_override = excluded.current_week_override, status = excluded.status`,
    [DEMO_IDS.program, DEMO_IDS.organization]
  );
  await client.query(
    `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved)
     values ('00000000-0000-4000-8000-000000000211', $1, $2, 'A2', true)
     on conflict (program_id, learner_id) do update set
       cefr = excluded.cefr,
       cefr_approved = excluded.cefr_approved`,
    [DEMO_IDS.program, DEMO_IDS.learner]
  );
  await client.query(
    `insert into program_weeks (id, program_id, week_number, topic, description, objectives, key_vocab_hint)
     values ($1, $2, 1, 'Introducing yourself & your job',
       'Tự giới thiệu trong buổi họp đầu với khách hoặc đồng nghiệp mới.',
       '["Nói/viết 4–6 câu về bản thân và công việc."]'::jsonb,
       'colleague, in charge of, department, deadline')
     on conflict (id) do nothing`,
    [DEMO_IDS.week, DEMO_IDS.program]
  );
  await client.query(
    `insert into program_weeks (id, program_id, week_number, topic, description, objectives, key_vocab_hint)
     values ($1, $2, 2, 'Emails & rescheduling meetings',
       'Viết email ngắn xin dời lịch và xác nhận lịch mới.',
       '["Viết email 60–100 từ xin dời lịch."]'::jsonb,
       'reschedule, postpone, available, confirm')
     on conflict (id) do nothing`,
    [DEMO_IDS.week2, DEMO_IDS.program]
  );
  for (const [id, taskKey, content] of promptDefaults) {
    await client.query(
      `insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
       values ($1, $2, $3, 1, $4, 'active', $5)
       on conflict (organization_id, task_key, version) do nothing`,
      [id, DEMO_IDS.organization, taskKey, content, DEMO_IDS.operator]
    );
    if (mode === "local" && taskKey === "weekly_lessons") {
      const versions = await client.query<{ version: number; status: string; content: string }>(
        `select version, status, content from prompt_versions
         where organization_id = $1 and task_key = $2
         order by version desc`,
        [DEMO_IDS.organization, taskKey]
      );
      const publication = planCanonicalPromptPublication(versions.rows, content);
      if (publication.shouldPublish) {
        await client.query(
          `insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
           values (gen_random_uuid(), $1, $2, $3, $4, 'active', $5)`,
          [DEMO_IDS.organization, taskKey, publication.nextVersion, content, DEMO_IDS.operator]
        );
      }
    }
  }
  await client.query(
    `insert into lesson_sets (id, program_week_id, cefr)
     values ($1, $2, 'A2') on conflict (id) do nothing`,
    [DEMO_IDS.lessonSet, DEMO_IDS.week]
  );
  await client.query(
    `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by, approved_by, published_at)
     values ($1, $2, 1, 'published', '{"source":"deterministic-seed"}'::jsonb, $3, $4, now())
     on conflict (id) do nothing`,
    [DEMO_IDS.publishedLessonSetVersion, DEMO_IDS.lessonSet, DEMO_IDS.operator, mode === "test" ? DEMO_IDS.checker : DEMO_IDS.operator]
  );

  for (const [index, lessonId] of DEMO_IDS.lessons.entries()) {
    const dayNumber = index + 1;
    const title = lessonTitles[index] ?? `Bài ${dayNumber}`;
    await client.query(
      `insert into lessons (id, lesson_set_version_id, day_number, title)
       values ($1, $2, $3, $4) on conflict (id) do update set title = excluded.title`,
      [lessonId, DEMO_IDS.publishedLessonSetVersion, dayNumber, title]
    );
    await client.query(
      `insert into lesson_versions (id, lesson_id, version, status, content)
       values ($1, $2, 1, 'published', $3::jsonb)
       on conflict (id) do update set content = excluded.content`,
      [DEMO_IDS.lessonVersions[index], lessonId, JSON.stringify(lessonContent(dayNumber, title))]
    );
  }

  // Keep the local demo learner deterministic across repeated prepare-local/E2E runs:
  // lesson 1 represents the already completed day, while lesson 2 must remain the
  // first unlocked lesson for the learner core flow. Older local runs may have
  // completed later lessons, so remove only those demo progress rows here.
  await client.query(
    `delete from progress_records
     where learner_id = $1 and lesson_id = any($2::uuid[])`,
    [DEMO_IDS.learner, DEMO_IDS.lessons.slice(1)]
  );
  await client.query(
    `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at)
     values ($1, $2, $3, 'completed', 90,
       '{"completedPartCodes":["listening","reading","writing","speaking"],"evidence":{"listening":{"attempts":1,"answer":"Customer emails"},"reading":{"attempts":1,"answer":"Our website"},"writing":{"attempts":1,"answer":"I work in AI."},"speaking":{"attempts":1,"answer":"seed-audio"}}}'::jsonb,
       now() - interval '1 day', now() - interval '1 day')
     on conflict (learner_id, lesson_id) do update set
       status = excluded.status,
       score = excluded.score,
       evidence = excluded.evidence,
       started_at = excluded.started_at,
       completed_at = excluded.completed_at,
       updated_at = now()`,
    [DEMO_IDS.progress, DEMO_IDS.learner, DEMO_IDS.lessons[0]]
  );
  await client.query(
    `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence, occurred_at)
     values ($1, $2, 'lesson', 'lesson', $3, 10, '{"source":"deterministic-seed"}'::jsonb, date_trunc('week', now()) + interval '9 hours')
     on conflict (id) do update set occurred_at = excluded.occurred_at`,
    [DEMO_IDS.activity, DEMO_IDS.learner, DEMO_IDS.lessons[0]]
  );
  for (const [id, key, label, description, seasonLevel] of badgeCatalog) {
    await client.query(
      `insert into badges (id, organization_id, badge_key, label, rule)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (id) do update set label = excluded.label, rule = excluded.rule`,
      [id, DEMO_IDS.organization, key, label, JSON.stringify({ description, seasonLevel })]
    );
  }
  await client.query(
    `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
     values ($1, $2, $3, 20, 'lesson', $4) on conflict (id) do nothing`,
    [DEMO_IDS.reward, DEMO_IDS.learner, DEMO_IDS.badge, DEMO_IDS.lessons[0]]
  );
  await client.query(
    `insert into micro_lessons (id, learner_id, program_week_id, cefr, topic, content, source)
     values ($1, $2, $3, 'A2', 'Email ngắn',
       '{"durationMinutes":5,"theory":"Dùng could để yêu cầu lịch sự.","vocabulary":["could","reschedule","confirm"],"practice":{"prompt":"Chọn câu xin dời lịch lịch sự.","type":"mcq","options":["Move it.","Could we reschedule to 3 PM?","I no come."],"answer":"Could we reschedule to 3 PM?"}}'::jsonb,
       'seed') on conflict (id) do update set content = excluded.content, source = excluded.source`,
    [DEMO_IDS.microLesson, DEMO_IDS.learner, DEMO_IDS.week]
  );

  await client.query(
    `insert into coach_sessions (id, learner_id, scenario, status)
     values ($1, $2, '{"title":"Daily meeting"}'::jsonb, 'active') on conflict (id) do nothing`,
    [DEMO_IDS.coachSession, DEMO_IDS.learner]
  );
  await client.query(
    `insert into coach_turns (id, session_id, turn_number, speaker, content, feedback, created_at)
     values
       ('00000000-0000-4000-8000-000000000852', $1, 1, 'learner', '{"text":"I work in AI."}'::jsonb, '{"rubricScore":4.2}'::jsonb, date_trunc('week', now()) + interval '10 hours'),
       ('00000000-0000-4000-8000-000000000853', $1, 2, 'learner', '{"text":"I prepare data."}'::jsonb, '{"rubricScore":4.4}'::jsonb, date_trunc('week', now()) + interval '11 hours')
     on conflict (id) do nothing`,
    [DEMO_IDS.coachSession]
  );
  await client.query(
    `insert into practice_submissions (id, learner_id, program_week_id, status, content, score, submitted_at, reviewed_at)
     values ($1, $2, $3, 'reviewed', '{"text":"Weekly sample"}'::jsonb, '{"total":86,"rubric":{"meaning":4,"vocabulary":4,"grammar":4}}'::jsonb,
       date_trunc('week', now()) - interval '3 days', date_trunc('week', now()) - interval '2 days')
     on conflict (id) do update set
       status = excluded.status,
       content = excluded.content,
       score = excluded.score,
       submitted_at = excluded.submitted_at,
       reviewed_at = excluded.reviewed_at,
       updated_at = now()`,
    [DEMO_IDS.practiceSubmission, DEMO_IDS.learner, DEMO_IDS.week]
  );
  await client.query(
    `insert into game_sets (id, program_week_id, game_key, status, payload)
     values ($1, $2, 'weekly_vocabulary', 'published', $3::jsonb)
     on conflict (id) do update set payload = excluded.payload, status = excluded.status`,
    [DEMO_IDS.gameSet, DEMO_IDS.week, JSON.stringify({
      topic: "Tuần 1: Introducing yourself & your job",
      cefr: "A2",
      words: [
        { id: "colleague", english: "colleague", vietnamese: "đồng nghiệp", definition: "a person you work with", partOfSpeech: "noun" },
        { id: "in-charge-of", english: "in charge of", vietnamese: "phụ trách", definition: "responsible for something", partOfSpeech: "phrase" },
        { id: "customer", english: "customer", vietnamese: "khách hàng", definition: "a person who buys goods or services", partOfSpeech: "noun" },
        { id: "join", english: "join", vietnamese: "gia nhập", definition: "to become part of a group", partOfSpeech: "verb" },
        { id: "project", english: "project", vietnamese: "dự án", definition: "a planned piece of work", partOfSpeech: "noun" },
        { id: "finish", english: "finish", vietnamese: "hoàn thành", definition: "to complete something", partOfSpeech: "verb" },
        { id: "deadline", english: "deadline", vietnamese: "hạn chót", definition: "the latest time work must be completed", partOfSpeech: "noun" },
        { id: "manager", english: "manager", vietnamese: "quản lý, trưởng phòng", definition: "a person who manages a team", partOfSpeech: "noun" },
        { id: "report-to", english: "report to", vietnamese: "báo cáo cho", definition: "to work under someone's direction", partOfSpeech: "phrase" },
        { id: "update", english: "update", vietnamese: "bản cập nhật", definition: "new information about progress", partOfSpeech: "noun" },
        { id: "website", english: "website", vietnamese: "trang web", definition: "a collection of web pages", partOfSpeech: "noun" },
        { id: "app", english: "app", vietnamese: "ứng dụng", definition: "a software application", partOfSpeech: "noun" },
        { id: "client", english: "client", vietnamese: "khách hàng (doanh nghiệp)", definition: "a person or company receiving a service", partOfSpeech: "noun" },
        { id: "plan", english: "plan", vietnamese: "lên kế hoạch", definition: "to decide how to do something", partOfSpeech: "verb" },
        { id: "visit", english: "visit", vietnamese: "đến thăm", definition: "to go and see a person or place", partOfSpeech: "verb" }
      ]
    })]
  );

  const assessments = [
    [DEMO_IDS.placementDefinition, "placement-a", "placement", "Bài test đầu vào", DEMO_IDS.placementVersion, placementDefinition],
    [DEMO_IDS.finalDefinition, "final-b", "final", "Bài kiểm tra cuối kỳ", DEMO_IDS.finalVersion, finalDefinition],
    [DEMO_IDS.levelUpDefinition, "levelup-b1", "level_up", "Đề thi lên mức B1", DEMO_IDS.levelUpVersion, levelUpDefinition]
  ] as const;
  for (const [definitionId, key, kind, title, versionId, blueprint] of assessments) {
    await client.query(
      `insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
       values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
      [definitionId, DEMO_IDS.organization, key, kind, title]
    );
    await client.query(
      `insert into assessment_versions (id, definition_id, version, status, blueprint, published_at)
       values ($1, $2, 1, 'published', $3::jsonb, now())
       on conflict (id) do update set blueprint = excluded.blueprint`,
      [versionId, definitionId, JSON.stringify(blueprint)]
    );
  }

  // The canonical demo learner has not taken the final assessment. Clear any
  // final attempts left by an earlier local run so the seeded profile and the
  // final-assessment route cannot show a stale result.
  await client.query(
    `delete from assessment_decisions
     where attempt_id in (
       select aa.id
       from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id
       where aa.learner_id = $1 and ad.kind = 'final'
     )`,
    [DEMO_IDS.learner]
  );
  await client.query(
    `delete from appeals
     where attempt_id in (
       select aa.id
       from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id
       where aa.learner_id = $1 and ad.kind = 'final'
     )`,
    [DEMO_IDS.learner]
  );
  await client.query(
    `delete from assessment_attempts aa
     using assessment_versions av, assessment_definitions ad
     where aa.assessment_version_id = av.id
       and av.definition_id = ad.id
       and aa.learner_id = $1
       and ad.kind = 'final'`,
    [DEMO_IDS.learner]
  );

  await client.query(
    `insert into assessment_attempts (id, assessment_version_id, learner_id, status, current_section, submitted_at)
     values ($1, $2, $3, 'approved', 'speaking', now() - interval '5 days') on conflict (id) do nothing`,
    [DEMO_IDS.placementAttempt, DEMO_IDS.placementVersion, DEMO_IDS.learner]
  );
  for (const [index, [section, score]] of [["listening", 14], ["reading", 16], ["writing", 13], ["speaking", 12]].entries()) {
    await client.query(
      `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
       values ($1, $2, $3, $4, '{}'::jsonb, 'human') on conflict (id) do nothing`,
      [`00000000-0000-4000-8000-${String(900 + index).padStart(12, "0")}`, DEMO_IDS.placementAttempt, section, score]
    );
  }
  await client.query(
    `insert into assessment_decisions (id, attempt_id, suggested_level, approved_level, status, reason, decided_by, decided_at)
     values ('00000000-0000-4000-8000-000000000910', $1, 'A2', 'A2', 'approved', 'Seeded demo decision', $2, now() - interval '4 days')
     on conflict (id) do nothing`,
    [DEMO_IDS.placementAttempt, DEMO_IDS.operator]
  );
}
