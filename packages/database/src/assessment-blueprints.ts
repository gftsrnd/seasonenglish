import type {
  AssessmentDefinitionView,
  AssessmentOption,
  AssessmentSectionCode,
  AssessmentTaskView,
  CefrLevel
} from "@e4s/contracts";

export interface StoredAssessmentTask extends AssessmentTaskView {
  correctAnswer?: string;
}

export interface StoredAssessmentDefinition extends Omit<AssessmentDefinitionView, "sections"> {
  targetLevel?: CefrLevel;
  sections: Array<Omit<AssessmentDefinitionView["sections"][number], "groups"> & {
    groups: Array<Omit<AssessmentDefinitionView["sections"][number]["groups"][number], "tasks"> & {
      tasks: StoredAssessmentTask[];
    }>;
  }>;
}

const optionLetters = ["A", "B", "C", "D"] as const;

function choice(key: string, prompt: string, labels: readonly string[], correctIndex: number, maxScore: number): StoredAssessmentTask {
  const options: AssessmentOption[] = labels.map((label, index) => ({ value: optionLetters[index] ?? String(index + 1), label }));
  const correctAnswer = options[correctIndex]?.value;
  if (!correctAnswer) throw new RangeError(`Missing answer option for ${key}`);
  return { key, prompt, responseType: "single_choice", maxScore, options, correctAnswer };
}

const listeningGroups: StoredAssessmentDefinition["sections"][number]["groups"] = [
  {
    key: "LA", title: "Part A – Thông báo của quản lý",
    instruction: "Nghe thông báo và trả lời câu 1–5.", maxPlays: 2,
    stimulus: { type: "audio_script", lines: [
      { speaker: "Manager", text: "Good morning, everyone. Just a quick reminder about tomorrow's team meeting. It will start at 9:30, not 9:00 as originally planned. We'll meet in Room 210. Please bring the latest sales report because we'll discuss our results from last month. If you have any questions, please speak to Sarah before the meeting." },
      { speaker: "Employee", text: "Why has the time changed?" },
      { speaker: "Manager", text: "The client has asked us to move our morning call, so we needed to change the meeting time." }
    ] },
    tasks: [
      choice("LA_0", "What time is the team meeting?", ["9:00", "9:30", "10:00", "10:30"], 1, 1),
      choice("LA_1", "Where is the meeting?", ["Room 201", "Room 210", "Room 220", "Online"], 1, 1),
      choice("LA_2", "What should employees bring?", ["Their laptops", "Their ID cards", "The sales report", "Their notebooks"], 2, 1),
      choice("LA_3", "Who should employees contact with questions?", ["David", "Sarah", "Tom", "James"], 1, 1),
      choice("LA_4", "Why has the meeting changed?", ["The manager is sick.", "The room is unavailable.", "The client changed the schedule.", "The company has technical problems."], 2, 1)
    ]
  },
  {
    key: "LB", title: "Part B – Hội thoại với cấp trên",
    instruction: "Nghe cuộc trao đổi và trả lời câu 6–10.", maxPlays: 2,
    stimulus: { type: "audio_script", lines: [
      { speaker: "Employee", text: "Hi, James. I'm working on the customer report, but I'm not sure which refund procedure applies." },
      { speaker: "Supervisor", text: "Have you checked the previous customer cases? We had a similar case last month. Check those records first. If you still cannot find the answer, come back to me. We have to send the report today, but there may be some flexibility with the exact time." }
    ] },
    tasks: [
      choice("LB_0", "What problem does the employee have?", ["She cannot access the website.", "She is having difficulty completing a report.", "She does not understand the customer.", "She cannot contact her manager."], 1, 1),
      choice("LB_1", "What does the supervisor suggest first?", ["Ask another department", "Check previous customer records", "Call the customer", "Send the report immediately"], 1, 1),
      choice("LB_2", "Why check previous records?", ["They may contain a similar case.", "They contain personal information.", "Company policy requires it.", "They are easier to understand."], 0, 1),
      choice("LB_3", "What will the employee do next?", ["Contact the customer", "Check previous cases", "Rewrite the report", "Ask IT"], 1, 1),
      choice("LB_4", "What does the supervisor say about the deadline?", ["It cannot change.", "It passed.", "There may be some flexibility.", "The report is unnecessary."], 2, 1)
    ]
  },
  {
    key: "LC", title: "Part C – Chính sách hybrid",
    instruction: "Nghe thảo luận và trả lời câu 11–15.", maxPlays: 2,
    stimulus: { type: "audio_script", lines: [
      { speaker: "Anna", text: "What do you think about the new hybrid-work policy?" },
      { speaker: "Mark", text: "People can concentrate better on individual work, but I am concerned that remote staff may miss informal decisions." },
      { speaker: "Anna", text: "We need clearer communication procedures. Important decisions could be documented in one shared system." },
      { speaker: "Mark", text: "Yes. That could make the system more reliable." }
    ] },
    tasks: [
      choice("LC_0", "What is the main concern discussed?", ["Salaries", "Office space", "Communication between teams", "Training"], 2, 2),
      choice("LC_1", "What advantage is mentioned?", ["Fewer hours", "Better concentration on individual tasks", "Fewer staff", "No meetings"], 1, 2),
      choice("LC_2", "What concern does Mark raise?", ["Some employees may receive less information.", "Employees may work too much.", "The office costs more.", "Customers may complain."], 0, 2),
      choice("LC_3", "What does Anna suggest?", ["Cancel the policy", "More meetings", "Clearer communication procedures", "Everyone in the office"], 2, 2),
      choice("LC_4", "What can be inferred?", ["They completely disagree.", "The policy has potential but needs adjustments.", "Remote work is impossible.", "Communication is unimportant."], 1, 2)
    ]
  }
];

const readingData: Array<[string, readonly string[], number]> = [
  ["Priya ____ a customer service agent.", ["are", "am", "is", "be"], 2],
  ["Marco needs to ____ the customer's problem.", ["sleep", "swim", "solve", "cook"], 2],
  ["The help desk is open from 9 to 5. When is it open?", ["From 9 to 5", "From 5 to 9", "Only Monday", "It is closed"], 0],
  ["The company has three ____ this week.", ["complaint", "complaint's", "complaints'", "complaints"], 3],
  ["Customer: I have a problem with my refund. Agent: ____", ["How can I help you?", "Where are you from?", "What is your favorite color?", "Goodbye."], 0],
  ["The support office is closed on ____.", ["Twelve", "Angry", "Sunday", "Green"], 2],
  ["Samuel ____ the manager yesterday.", ["call", "called", "calling", "calls"], 1],
  ["The support team will ____ the complaint carefully.", ["look after", "look for", "look out for", "look into"], 3],
  ["Your refund of $45 will arrive in 5 business days. How much is the refund?", ["$54", "$45", "5 days", "45 days"], 1],
  ["This month we received ____ complaints than last month.", ["few", "fewer", "less", "more little"], 1],
  ["Agent: Your order number, please? Customer: Sorry, ____?", ["could you repeat that", "I am fine", "see you later", "it is Tuesday"], 0],
  ["Marco could not fix the problem, so he asked his ____ for help.", ["customer", "supervisor", "invoice", "deadline"], 1],
  ["After opening the refund form, what should you do?", ["Click submit", "Enter your order number", "Close it", "Call the manager"], 1],
  ["Nadia ____ three emails, but nobody has replied yet.", ["sent", "is sending", "send", "has sent"], 3],
  ["The manager decided to ____ a complaint seriously.", ["make", "do", "take", "have"], 2],
  ["A cracked laptop was collected and refunded quickly. What is the main idea?", ["A customer forgot to pay", "A company resolved a complaint quickly", "A courier changed schedule", "A factory had problems"], 1],
  ["If the item arrives damaged, customers ____ contact support within 48 hours.", ["would", "should", "were", "did"], 1],
  ["Unfortunately, we ____ offer a refund after 30 days.", ["are unable to", "are happy to", "never wanted to", "always refuse to"], 0],
  ["The refund was approved; ____, it will take five days.", ["however", "otherwise", "as a result", "in order that"], 0],
  ["Priya repeated the same billing story four times and cancelled. What can you infer?", ["She was happy", "She never contacted", "She fixed it", "She was frustrated"], 3],
  ["Diego said that the refund ____ already been processed.", ["has", "had", "have", "was"], 1],
  ["Chen writes politely but lists every delay. What does this suggest?", ["He is losing patience.", "He is satisfied.", "He does not care.", "He is grateful throughout."], 0],
  ["Which is the most diplomatic refund rejection?", ["No refund.", "Read the policy.", "We refuse.", "We understand your frustration, but this falls outside our policy."], 3],
  ["The agent finally managed ____ the source of the error.", ["finding", "find", "to find", "founded"], 2],
  ["The support team will ____ the customer by email.", ["notice", "note", "know", "notify"], 3],
  ["The ticket was mislabeled from the start. What does 'this explanation' refer to?", ["The complaint", "The departments", "The ticket being mislabeled", "The refund policy"], 2],
  ["Which reply suits a formal corporate complaint?", ["Oops, my bad!", "We'll sort it.", "We sincerely apologize and will resolve this promptly.", "Chill."], 2],
  ["____ had the refund been processed than the customer called again.", ["As soon", "Not until", "Hardly ever", "No sooner"], 3],
  ["Tickets close faster but satisfaction barely changes. What does the evidence support?", ["The system failed", "Faster replies did not meaningfully improve satisfaction", "Satisfaction doubled", "Tickets take four days"], 1],
  ["Which phrasing best de-escalates without conceding fault?", ["I hear how frustrating this has been, and I want to understand what happened.", "Calm down.", "Not our fault.", "Why are you upset?"], 0],
  ["____ the complaint himself, Samuel understood the customer.", ["Handled", "To handle", "Having handled", "Handling having"], 2],
  ["Refund delays would be addressed ____ the board.", ["over", "across", "along", "through"], 1],
  ["The manager admitted the 24-hour promise was unrealistic. What does 'this admission' mean?", ["Aisha's decision", "The delay", "The policy", "The manager's statement"], 3],
  ["The refund was purely ____, not obligatory.", ["mandatory", "contractual", "statutory", "discretionary"], 3],
  ["By the time the manager arrived, the customer ____ for over an hour.", ["had been waiting", "was waiting", "has waited", "waited"], 0],
  ["Resolution metrics and customer trust are loosely correlated. What follows?", ["Fast closure does not ensure customers feel heard.", "Stop measuring time.", "Trust is highest when fast.", "Systems measure trust accurately."], 0],
  ["Which reply implies a refund without explicitly promising one?", ["I expect you'll be pleased with the outcome by Friday.", "You will get a full refund.", "We cannot refund.", "No compensation."], 0],
  ["The complaint was deemed ____, meaning it had no basis.", ["unfinished", "unfamiliar", "unfounded", "unforeseen"], 2],
  ["The rollout was 'not without its complications.' What does it imply?", ["It was perfect", "It was cancelled", "The writer is certain", "It had significant problems"], 3],
  ["Neither the manager nor the agents ____ aware.", ["was", "is", "were", "has been"], 2]
];

const readingGroups: StoredAssessmentDefinition["sections"][number]["groups"] = [0, 1, 2, 3].map((groupIndex) => ({
  key: `R${groupIndex + 1}`,
  title: `Questions ${groupIndex * 10 + 1}–${groupIndex * 10 + 10}`,
  instruction: "Chọn một đáp án đúng nhất.",
  tasks: readingData.slice(groupIndex * 10, groupIndex * 10 + 10).map(([prompt, labels, answer], index) =>
    choice(`R${groupIndex * 10 + index + 1}`, prompt, labels, answer, 1)
  )
}));

export const placementDefinition: StoredAssessmentDefinition = {
  key: "placement-a",
  kind: "placement",
  title: "Workplace English CEFR Placement Test",
  version: 1,
  totalMinutes: 70,
  totalScore: 100,
  sections: [
    { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: ["Mỗi đoạn nghe được phát tối đa 2 lần."], groups: listeningGroups },
    { code: "reading", title: "Đọc, Ngữ pháp & Từ vựng", durationMinutes: 20, maxScore: 40, instructions: ["40 câu, mỗi câu 1 điểm."], groups: readingGroups },
    { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: ["Rubric chung: task achievement · organization · vocabulary · grammar · workplace communication (mỗi tiêu chí 1–5)."], groups: [
      { key: "W1", title: "Task 1 – Phản hồi nhanh (7 phút · A2–B1)", instruction: "You receive this message from a colleague:", stimulus: { type: "message", text: "Hi! I need to take tomorrow morning off urgently for a family matter. Could you help me monitor the customer support inbox from 9 AM to 12 PM? I owe you one!" }, tasks: [
        { key: "W1", prompt: "Write a short reply (50–80 words): agree to help and ask whether there are any important tickets you should pay special attention to.", responseType: "long_text", maxScore: 7, minWords: 50, maxWords: 80 }
      ] },
      { key: "W2", title: "Task 2 – Báo cáo / đề xuất (13 phút · B2–C1)", instruction: "You work for a company that is updating its customer-service procedures. Your manager has sent you this message:", stimulus: { type: "message", text: "Hi,\nSeveral employees have said that they are sometimes unsure which customer-service procedure is the most recent one." }, tasks: [
        { key: "W2", prompt: "Write a formal email (120–150 words) replying to your manager: explain one serious problem this confusion could cause (for example, giving a customer the wrong refund information) and propose a solution that makes it easy for the team to find and use the latest documents.", responseType: "long_text", maxScore: 13, minWords: 120, maxWords: 150 }
      ] }
    ] },
    { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: ["Nộp file ghi âm cho từng task (mp3, m4a, wav hoặc webm; tối đa 20 MB). Bạn có thể ghi âm trực tiếp hoặc tải file có sẵn, sau đó gõ lại nội dung đã nói vào ô bên dưới để được chấm."], groups: [
      { key: "S1", title: "Task 1 – Warm-up (3 phút · A1–A2)", instruction: "The examiner asks:", tasks: [
        { key: "S1", prompt: "1. What do you do?\n2. What are your main responsibilities?\n3. What English do you use at work?\n4. What is one situation in which you find English difficult?", responseType: "speaking_evidence", maxScore: 5, hint: "Trả lời lần lượt 4 câu hỏi, mỗi câu 2–4 câu nói." }
      ] },
      { key: "S2", title: "Task 2 – Data description (4 phút · B1–B2)", instruction: "You are in a team meeting. The table shows the number of customer complaints in the last three quarters. You have 30 seconds to look at the data. Then speak for 1–2 minutes:", stimulus: { type: "table", headers: ["Quarter", "Total complaints", "Most common issue"], rows: [["Q1", "120", "Delayed shipping"], ["Q2", "115", "Delayed shipping"], ["Q3", "280", "Software bugs"]] }, tasks: [
        { key: "S2", prompt: "1. Summarise the main trend in the numbers.\n2. Point out the biggest change in Q3.\n3. Suggest one short-term action the team should take to deal with the Q3 problem.", responseType: "speaking_evidence", maxScore: 5, hint: "Dùng từ vựng mô tả số liệu: increase, decrease, remain stable, the biggest change…" }
      ] },
      { key: "S3", title: "Task 3 – Roleplay (4 phút · B2–C1)", instruction: "You are a Customer Care Specialist. The examiner plays a customer who is very upset because the refund has not arrived, although the customer was told it would arrive within five days.", tasks: [
        { key: "S3", prompt: "Apologise, explain the accounting system error and clearly commit to a solution.", responseType: "speaking_evidence", maxScore: 5, hint: "Giao tiếp trực tiếp như đang nói với khách hàng." }
      ] },
      { key: "S4", title: "Task 4 – Monologue (4 phút · B2–C1)", instruction: "You are presenting to your team.", tasks: [
        { key: "S4", prompt: "Present the benefits and challenges of a centralised internal knowledge platform. Include examples and a conclusion.", responseType: "speaking_evidence", maxScore: 5, hint: "Nêu ít nhất hai lợi ích và hai thách thức." }
      ] }
    ] }
  ]
};

export const finalDefinition: StoredAssessmentDefinition = {
  ...placementDefinition,
  key: "final-b",
  kind: "final",
  title: "Bài kiểm tra cuối kỳ",
  sections: placementDefinition.sections.map((section) => ({ ...section, groups: section.groups.map((group) => ({ ...group, tasks: group.tasks.map((task) => ({ ...task })) })) }))
};

export const levelUpDefinition: StoredAssessmentDefinition = {
  key: "levelup-b1", kind: "level-up", title: "Đề thi lên mức B1", version: 1, totalMinutes: 38, totalScore: 100, targetLevel: "B1",
  sections: [
    { code: "listening", title: "Nghe", durationMinutes: 8, maxScore: 25, instructions: ["5 câu, mỗi câu 5 điểm."], groups: [{ ...listeningGroups[0]!, tasks: listeningGroups[0]!.tasks.map((task) => ({ ...task, maxScore: 5 })) }] },
    { code: "reading", title: "Đọc", durationMinutes: 13, maxScore: 25, instructions: ["5 câu, mỗi câu 5 điểm."], groups: [{ ...readingGroups[1]!, tasks: readingGroups[1]!.tasks.slice(0, 5).map((task) => ({ ...task, maxScore: 5 })) }] },
    { code: "writing", title: "Viết", durationMinutes: 10, maxScore: 25, instructions: ["Viết 80–120 từ theo tình huống công việc."], groups: [{ key: "LW", title: "Writing", instruction: "Hoàn thành một task.", tasks: [{ key: "LW1", prompt: "Viết email xác nhận một thay đổi lịch họp và đề xuất bước tiếp theo.", responseType: "long_text", maxScore: 25, minWords: 80, maxWords: 120 }] }] },
    { code: "speaking", title: "Nói", durationMinutes: 7, maxScore: 25, instructions: ["Hoàn thành một tình huống nói ở mức đích."], groups: [{ key: "LS", title: "Speaking", instruction: "Nộp bằng chứng nói.", tasks: [{ key: "LS1", prompt: "Giải thích cho đồng nghiệp một dự án bị trễ và thống nhất hành động tiếp theo.", responseType: "speaking_evidence", maxScore: 25 }] }] }
  ]
};

export function publicAssessmentDefinition(stored: StoredAssessmentDefinition): AssessmentDefinitionView {
  return {
    ...stored,
    sections: stored.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        tasks: group.tasks.map(({ correctAnswer: _correctAnswer, ...task }) => task)
      }))
    }))
  };
}

export function sectionByCode(definition: StoredAssessmentDefinition, code: AssessmentSectionCode) {
  return definition.sections.find((section) => section.code === code) ?? null;
}
