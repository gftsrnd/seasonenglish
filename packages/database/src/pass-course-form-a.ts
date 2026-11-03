import type { AssessmentOption } from "@e4s/contracts";
import type { StoredAssessmentDefinition, StoredAssessmentTask } from "./assessment-blueprints.js";

/** Canonical fixed exit examination supplied in e4s_de_thi_pass_course_ver_1.docx. */
const letters = ["A", "B", "C", "D"] as const;

function choice(key: string, prompt: string, labels: readonly string[], correct: string, maxScore: number): StoredAssessmentTask {
  const options: AssessmentOption[] = labels.map((label, index) => ({ value: letters[index]!, label }));
  return { key, prompt, responseType: "single_choice", maxScore, options, correctAnswer: correct };
}

const listeningQuestions = [
  {
    "prompt": "Who is the message for?",
    "options": [
      "Peter",
      "Hoa",
      "The IT manager",
      "A new employee"
    ]
  },
  {
    "prompt": "What has arrived?",
    "options": [
      "A new laptop",
      "A new phone",
      "A new printer",
      "A new desk"
    ]
  },
  {
    "prompt": "Where is the IT desk?",
    "options": [
      "On the 3rd floor",
      "On the 4th floor",
      "On the 14th floor",
      "On the 40th floor"
    ]
  },
  {
    "prompt": "What must Hoa bring?",
    "options": [
      "Her old laptop and its charger",
      "Her ID card",
      "A signed form",
      "Nothing"
    ]
  },
  {
    "prompt": "What number should Hoa call if this week is difficult?",
    "options": [
      "Extension 247",
      "Extension 274",
      "Extension 427",
      "Extension 742"
    ]
  },
  {
    "prompt": "Why is Linh calling?",
    "options": [
      "To order more brochures",
      "To ask about an order that has not arrived",
      "To cancel her order",
      "To change the brochure design"
    ]
  },
  {
    "prompt": "What went wrong with the order?",
    "options": [
      "It was printed on the wrong paper.",
      "It was sent to the wrong address.",
      "A printing machine broke.",
      "The payment did not go through."
    ]
  },
  {
    "prompt": "When does Linh need the brochures?",
    "options": [
      "On Friday morning",
      "Before a trade fair on Saturday",
      "Next Monday",
      "This afternoon"
    ]
  },
  {
    "prompt": "What does Jenny offer?",
    "options": [
      "A full refund",
      "A 20% discount",
      "A free reprint delivered by Friday noon",
      "Delivery on Saturday morning"
    ]
  },
  {
    "prompt": "What must happen before the reprint starts?",
    "options": [
      "Linh must pay again.",
      "Linh must approve photos of samples.",
      "Jenny must visit Linh's office.",
      "Linh's manager must sign a form."
    ]
  },
  {
    "prompt": "What is the interview mainly about?",
    "options": [
      "Hiring staff from other countries",
      "Learning foreign languages at work",
      "Giving and receiving feedback in international teams",
      "Reducing the number of meetings"
    ]
  },
  {
    "prompt": "According to Dr. Mehta, why does feedback often go wrong?",
    "options": [
      "People assume their own communication style is neutral.",
      "Managers rarely give feedback.",
      "Employees do not want to improve.",
      "Feedback is usually given too late."
    ]
  },
  {
    "prompt": "What risk of \"over-softening\" does she mention?",
    "options": [
      "Managers lose authority.",
      "Meetings take longer.",
      "Colleagues feel attacked.",
      "People may not realise that anything needs to change."
    ]
  },
  {
    "prompt": "What does she recommend teams do?",
    "options": [
      "Use only written feedback",
      "Agree in advance how direct they will be and how they will check understanding",
      "Avoid giving negative feedback",
      "Let HR give all feedback"
    ]
  },
  {
    "prompt": "What advice does she give to people receiving feedback?",
    "options": [
      "Defend their work clearly",
      "Accept it without comment",
      "Ask questions such as \"Could you give me an example?\"",
      "Wait a week before replying"
    ]
  }
] as const;
const readingQuestions = [
  {
    "prompt": "Linh ____ in the marketing team.",
    "options": [
      "work",
      "works",
      "working",
      "to work"
    ]
  },
  {
    "prompt": "Please ____ the door when you leave the meeting room.",
    "options": [
      "close",
      "eat",
      "sing",
      "drive"
    ]
  },
  {
    "prompt": "Read this notice: \"Lunch break: 12:00–1:00. Canteen on floor 2.\" – Where is the canteen?",
    "options": [
      "On floor 1",
      "On floor 2",
      "On floor 12",
      "Outside the building"
    ]
  },
  {
    "prompt": "There ____ two printers on this floor.",
    "options": [
      "is",
      "be",
      "are",
      "am"
    ]
  },
  {
    "prompt": "Colleague: \"Thanks for your help today!\" You: \"____\"",
    "options": [
      "You're welcome.",
      "I'm 25 years old.",
      "It's Monday.",
      "Goodbye forever."
    ]
  },
  {
    "prompt": "Our weekly meeting is ____ Monday at 10 a.m.",
    "options": [
      "in",
      "at",
      "on",
      "by"
    ]
  },
  {
    "prompt": "Which word has the same vowel sound as \"team\"?",
    "options": [
      "ten",
      "meet",
      "time",
      "tame"
    ]
  },
  {
    "prompt": "I ____ the report to my manager yesterday.",
    "options": [
      "send",
      "sent",
      "sending",
      "sends"
    ]
  },
  {
    "prompt": "Read this email: \"Hi Tom, the client meeting has moved from Tuesday to Thursday. Same time, 3 p.m. – Mai\" – When is the meeting now?",
    "options": [
      "Tuesday at 3 p.m.",
      "Thursday at 3 p.m.",
      "Thursday at 2 p.m.",
      "Tuesday at 2 p.m."
    ]
  },
  {
    "prompt": "We haven't finished the slides ____.",
    "options": [
      "already",
      "yet",
      "still",
      "just"
    ]
  },
  {
    "prompt": "Could you ____ me the file, please?",
    "options": [
      "send",
      "sending",
      "sent",
      "to send"
    ]
  },
  {
    "prompt": "In the word \"report\" (noun), which syllable is stressed?",
    "options": [
      "re-",
      "-port",
      "Both equally",
      "Neither"
    ]
  },
  {
    "prompt": "If the client ____ the budget, we will start next week.",
    "options": [
      "approve",
      "approves",
      "approved",
      "will approve"
    ]
  },
  {
    "prompt": "Read this notice: \"All staff must complete the online security course by 30 June. The course takes about 40 minutes.\" – What must staff do?",
    "options": [
      "Attend a meeting in June",
      "Finish an online course before a deadline",
      "Teach a security course",
      "Pay 40 dollars"
    ]
  },
  {
    "prompt": "You ____ wear a suit on Fridays; casual clothes are fine.",
    "options": [
      "mustn't",
      "don't have to",
      "can't",
      "shouldn't"
    ]
  },
  {
    "prompt": "The launch was ____ because the vendor delivered late.",
    "options": [
      "delay",
      "delaying",
      "delayed",
      "delays"
    ]
  },
  {
    "prompt": "How is the -ed ending pronounced in \"worked\"?",
    "options": [
      "/t/",
      "/d/",
      "/ɪd/",
      "It is silent"
    ]
  },
  {
    "prompt": "She asked me ____ I could join the call at 4 p.m.",
    "options": [
      "that",
      "if",
      "what",
      "which"
    ]
  },
  {
    "prompt": "Read this paragraph: \"Ben's team missed two deadlines last month. After a short review, they found that tasks were often assigned in chat and then forgotten. They now use a shared task board, and they have not missed a deadline since.\" – What solved the problem?",
    "options": [
      "Hiring more staff",
      "Longer deadlines",
      "A shared task board",
      "More chat groups"
    ]
  },
  {
    "prompt": "The new system is ____ easier to use than the old one.",
    "options": [
      "much",
      "very",
      "more",
      "most"
    ]
  },
  {
    "prompt": "I'm looking forward ____ from you.",
    "options": [
      "hear",
      "to hear",
      "to hearing",
      "hearing"
    ]
  },
  {
    "prompt": "The sales report ____ by the finance team every month.",
    "options": [
      "prepares",
      "is prepared",
      "prepared",
      "is preparing"
    ]
  },
  {
    "prompt": "Which message is the most appropriate to send to your manager?",
    "options": [
      "Gimme one more day.",
      "Could I have one more day to finish the report?",
      "No way I can finish today.",
      "Whatever, I'll do it later."
    ]
  },
  {
    "prompt": "We need to ____ the meeting until next week because the CEO is away.",
    "options": [
      "put off",
      "put on",
      "put up",
      "put out"
    ]
  },
  {
    "prompt": "By the time the client called, we ____ the contract.",
    "options": [
      "already sent",
      "had already sent",
      "have already sent",
      "already send"
    ]
  },
  {
    "prompt": "Read this paragraph: \"Although a survey showed that 80% of staff liked remote work, managers noticed that new employees felt isolated and learned more slowly. The company therefore introduced two office days a week for teams with new members.\" – Why were office days introduced?",
    "options": [
      "Most staff disliked remote work.",
      "To support new employees.",
      "To reduce office costs.",
      "Because the survey required it."
    ]
  },
  {
    "prompt": "If I ____ you, I would ask for a written agreement.",
    "options": [
      "am",
      "will be",
      "were",
      "be"
    ]
  },
  {
    "prompt": "A colleague says: \"We need a NEW plan, not the old one.\" Why is \"NEW\" stressed?",
    "options": [
      "It is a long word.",
      "To contrast it with the old plan.",
      "It is the subject of the sentence.",
      "It is a mistake."
    ]
  },
  {
    "prompt": "The manager insisted that every invoice ____ checked twice.",
    "options": [
      "be",
      "is being",
      "was",
      "been"
    ]
  },
  {
    "prompt": "____ the delay, the team still delivered the project on time.",
    "options": [
      "Although",
      "Despite",
      "Because",
      "Even"
    ]
  },
  {
    "prompt": "The proposal, ____ was submitted last week, is still under review.",
    "options": [
      "that",
      "which",
      "who",
      "what"
    ]
  },
  {
    "prompt": "Not only ____ the deadline, but they also went over budget.",
    "options": [
      "they missed",
      "did they miss",
      "they did miss",
      "missed they"
    ]
  },
  {
    "prompt": "Read this paragraph: \"Productivity figures rose during the four-day-week trial, yet the report admits that the most demanding projects were postponed until after the trial ended. Critics argue that the gains may therefore be overstated.\" – What is the critics' point?",
    "options": [
      "Productivity did not change at all.",
      "The results look better because difficult work was delayed.",
      "A four-day week is illegal.",
      "The report hid all the figures."
    ]
  },
  {
    "prompt": "The new travel policy will ____ effect from 1 January.",
    "options": [
      "take",
      "make",
      "do",
      "have"
    ]
  },
  {
    "prompt": "Her feedback was ____: it pointed out problems without blaming anyone.",
    "options": [
      "blunt",
      "constructive",
      "vague",
      "hostile"
    ]
  },
  {
    "prompt": "Which sentence is the most tactful way to disagree in a meeting?",
    "options": [
      "You're wrong.",
      "That's not true.",
      "I see your point, but I'm not entirely sure that would work for us.",
      "No."
    ]
  },
  {
    "prompt": "Had we known about the budget cut, we ____ the campaign differently.",
    "options": [
      "would plan",
      "will plan",
      "would have planned",
      "planned"
    ]
  },
  {
    "prompt": "The board's decision was ____; nothing like it had happened before.",
    "options": [
      "foreseeable",
      "unprecedented",
      "routine",
      "predictable"
    ]
  },
  {
    "prompt": "Read this line from a report: \"The vendor's performance this quarter has been, to put it mildly, uneven.\" – What does the writer mean?",
    "options": [
      "The performance was excellent.",
      "The performance was consistently good.",
      "There were clear problems, described politely.",
      "The writer has no information."
    ]
  },
  {
    "prompt": "What we need ____ a clear timeline, not more meetings.",
    "options": [
      "are",
      "is",
      "be",
      "being"
    ]
  }
] as const;
const listeningAnswers = ["B", "A", "B", "A", "A", "B", "A", "B", "C", "B", "C", "A", "D", "B", "C"] as const;
const readingAnswers = ["B", "A", "B", "C", "A", "C", "B", "B", "B", "B", "A", "B", "B", "B", "B", "C", "A", "B", "C", "A", "C", "B", "B", "A", "B", "B", "C", "B", "A", "B", "B", "B", "B", "A", "B", "B", "C", "C", "B", "B"] as const;

const listeningStimuli = [
  { key: "L1", title: "Part A – Tin nhắn thoại từ bộ phận IT", instruction: "Listen to a voicemail. Answer Questions 1–5.", audioSrc: "/media/audio/pass-course-form-a-listening-a.wav", lines: [{ speaker: "Peter (IT)", text: "Hi, this is Peter from IT support. This message is for Hoa in Accounts. Your new laptop has arrived. You can collect it from the IT desk on the fourth floor any day this week between one and five p.m. Please bring your old laptop and its charger, because we need to take them back. It takes about fifteen minutes to set up the new one, so please don't come right at five o'clock. If this week is difficult for you, call me on extension two-four-seven. Thanks!" }] },
  { key: "L2", title: "Part B – Cuộc gọi với nhà in", instruction: "Listen to a phone call between a customer and a printing company. Answer Questions 6–10.", audioSrc: "/media/audio/pass-course-form-a-listening-b.wav", lines: [{ speaker: "Jenny", text: "BrightPrint, Jenny speaking." }, { speaker: "Linh", text: "Hi Jenny, it's Linh from Anvil Design. I'm calling about our order of five hundred brochures. They were supposed to arrive this morning." }, { speaker: "Jenny", text: "Let me check… I'm sorry, it seems the order was printed on the wrong paper, so our quality team stopped it." }, { speaker: "Linh", text: "Oh no. We need them for a trade fair on Saturday." }, { speaker: "Jenny", text: "I understand. We can reprint them today and deliver by Friday noon, at no extra cost." }, { speaker: "Linh", text: "Friday noon is fine, as long as they're definitely on time. Could you send some photos of the samples first, so we can check the colours?" }, { speaker: "Jenny", text: "Of course. I'll send them within the hour, and as soon as you approve them, we'll start printing." }] },
  { key: "L3", title: "Part C – Phỏng vấn podcast về góp ý trong nhóm quốc tế", instruction: "Listen to part of a podcast interview. Answer Questions 11–15.", audioSrc: "/media/audio/pass-course-form-a-listening-c.wav", lines: [{ speaker: "Host", text: "Today we're talking about feedback in international teams. Dr. Mehta, why does feedback so often go wrong?" }, { speaker: "Dr. Mehta", text: "Mostly because people assume their own style is neutral. A manager who's used to very direct comments may think he's simply being clear, while a colleague from a more indirect culture hears it as an attack." }, { speaker: "Host", text: "So should managers just soften everything?" }, { speaker: "Dr. Mehta", text: "Not necessarily. Over-softening has its own risk: the message gets lost, and people don't realise anything needs to change. What works better is agreeing on expectations up front – how direct we'll be, and how we'll check that the message has landed." }, { speaker: "Host", text: "And what about the people receiving feedback?" }, { speaker: "Dr. Mehta", text: "Ask questions rather than defend yourself. Something like \"Could you give me an example?\" turns a tense moment into a useful one." }] }
];

export const passCourseFormADefinition: StoredAssessmentDefinition = {
  key: "pass-course-form-a", kind: "pass-course", title: "Pass Course – Form A", version: 1, totalMinutes: 90, totalScore: 100, targetLevel: "C1",
  sections: [
    { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: ["15 câu: câu 1–10 mỗi câu 1 điểm; câu 11–15 mỗi câu 2 điểm.", "Mỗi audio phát tối đa 2 lần."], groups: listeningStimuli.map((part, partIndex) => ({ key: part.key, title: part.title, instruction: part.instruction, maxPlays: 2, stimulus: { type: "audio_script", audioSrc: part.audioSrc, lines: part.lines }, tasks: listeningQuestions.slice(partIndex * 5, partIndex * 5 + 5).map((question, index) => { const number = partIndex * 5 + index; return choice(`L${number + 1}`, question.prompt, question.options, listeningAnswers[number]!, number < 10 ? 1 : 2); }) })) },
    { code: "reading", title: "Đọc, Ngữ pháp & Từ vựng", durationMinutes: 25, maxScore: 40, instructions: ["40 câu, mỗi câu 1 điểm.", "Thứ tự câu và lựa chọn A–D theo Form A cố định."], groups: [0, 1, 2, 3].map(groupIndex => ({ key: `R${groupIndex + 1}`, title: `Questions ${groupIndex * 10 + 1}–${groupIndex * 10 + 10}`, instruction: "Choose the best answer.", tasks: readingQuestions.slice(groupIndex * 10, groupIndex * 10 + 10).map((question, index) => { const number = groupIndex * 10 + index; return choice(`R${number + 1}`, question.prompt, question.options, readingAnswers[number]!, 1); }) })) },
    { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: ["Task 1: 50–80 từ, 7 điểm. Task 2: 120–150 từ, 13 điểm.", "Chấm theo 5 tiêu chí: task completion, organization, vocabulary, grammar và workplace register."], groups: [
      { key: "W1", title: "Task 1 – Phản hồi nhanh (7 phút · 7 điểm)", instruction: "Bạn nhận được tin nhắn từ đồng nghiệp:", stimulus: { type: "message", text: "Hi! I'm stuck in traffic and will be about 20 minutes late for the 9:00 client call. Could you start the meeting for me and share the agenda?" }, tasks: [{ key: "W1", prompt: "Viết phản hồi đồng ý giúp, và hỏi đồng nghiệp nên trình bày nội dung nào trước trong lúc chờ họ vào.", responseType: "long_text", maxScore: 7, minWords: 50, maxWords: 80 }] },
      { key: "W2", title: "Task 2 – Email/Đề xuất (13 phút · 13 điểm)", instruction: "Quản lý nhắn:", stimulus: { type: "message", text: "Hi, our team has missed several deadlines recently. It seems that tasks are assigned in many different chat groups and people lose track of them." }, tasks: [{ key: "W2", prompt: "Viết email chính thức phản hồi quản lý: giải thích một hậu quả nghiêm trọng của tình trạng này và đề xuất một giải pháp khả thi để cả nhóm theo dõi công việc dễ hơn.", responseType: "long_text", maxScore: 13, minWords: 120, maxWords: 150 }] }
    ] },
    { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: ["4 task, mỗi task 5 điểm. Không chấm phát âm.", "Ghi âm trực tiếp hoặc tải file âm thanh cho từng task."], groups: [
      { key: "S1", title: "Task 1 – Warm-up (3 phút · 5 điểm)", instruction: "The examiner asks:", tasks: [{ key: "S1", prompt: "1. Can you describe your team and what it does?\n2. What does a typical working day look like for you?\n3. When do you use English at work?\n4. Tell me about one thing you did well at work recently.", responseType: "speaking_evidence", maxScore: 5, hint: "Trả lời lần lượt 4 câu hỏi." }] },
      { key: "S2", title: "Task 2 – Mô tả số liệu (4 phút · 5 điểm)", instruction: "Bạn đang trong cuộc họp nhóm. Có 30 giây xem số liệu, sau đó nói 1–2 phút.", stimulus: { type: "table", headers: ["Quý", "Dự án đúng hạn", "Nguyên nhân trễ phổ biến nhất"], rows: [["Q1", "85%", "Khách hàng duyệt chậm"], ["Q2", "82%", "Khách hàng duyệt chậm"], ["Q3", "60%", "Thiếu nhân sự"]] }, tasks: [{ key: "S2", prompt: "1. Tóm tắt xu hướng chính.\n2. Chỉ ra thay đổi lớn nhất ở Q3.\n3. Đề xuất một việc nhóm nên làm ngay để cải thiện Q4.", responseType: "speaking_evidence", maxScore: 5 }] },
      { key: "S3", title: "Task 3 – Roleplay với đồng nghiệp (4 phút · 5 điểm)", instruction: "Bạn là trưởng nhóm Data. Một đồng nghiệp phòng Sales không hài lòng vì báo cáo số liệu nhóm bạn hứa gửi thứ Hai đến giờ vẫn chưa có.", stimulus: { type: "message", text: "I'm really disappointed. You promised the sales data by Monday, and I still don't have it. I'm presenting to the client on Thursday. What's going on?" }, tasks: [{ key: "S3", prompt: "Trả lời chuyên nghiệp: (1) ghi nhận sự khó chịu; (2) giải thích việc chuyển đổi hệ thống dữ liệu đã làm trễ; (3) đề xuất bước tiếp theo cụ thể; (4) nói rõ khi nào họ nhận được báo cáo hoặc cập nhật.", responseType: "speaking_evidence", maxScore: 5 }] },
      { key: "S4", title: "Task 4 – Monologue (4 phút · 5 điểm)", instruction: "Prepare for one minute, then speak for 2–3 minutes.", tasks: [{ key: "S4", prompt: "Your company is considering a four-day working week for office staff, with the same salary and longer working days. Present the benefits and challenges of this proposal, with your own view.", responseType: "speaking_evidence", maxScore: 5 }] }
    ] }
  ]
};
