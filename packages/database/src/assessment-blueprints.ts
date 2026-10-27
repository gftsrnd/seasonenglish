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
    instruction: "Nghe thông báo và trả lời câu 1–4.", maxPlays: 2,
    stimulus: { type: "audio_script", audioSrc: "/media/audio/placement-listening-LA.wav", lines: [
      { speaker: "Manager", text: "Good morning, everyone. Just a quick reminder about tomorrow's team meeting. It will start at 9:30, not 9:00 as originally planned. We'll meet in Room 210. Please bring the latest sales report because we'll discuss our results from last month." },
      { speaker: "Employee", text: "Why has the time changed?" },
      { speaker: "Manager", text: "The client has asked us to move our morning call, so we needed to change the meeting time." }
    ] },
    tasks: [
      choice("LA_0", "What time is the team meeting?", ["9:00", "9:30", "10:00", "10:30"], 1, 1),
      choice("LA_1", "Where is the meeting?", ["Room 201", "Room 210", "Room 220", "Online"], 1, 1),
      choice("LA_2", "What should employees bring?", ["Their laptops", "Their ID cards", "The sales report", "Their notebooks"], 2, 1),
      choice("LA_4", "Why has the meeting changed?", ["The manager is sick.", "The room is unavailable.", "The client has changed the schedule.", "The company is having technical problems."], 2, 1)
    ]
  },
  {
    key: "LB", title: "Part B – Hội thoại với cấp trên",
    instruction: "Nghe cuộc trao đổi và trả lời câu 5–10.", maxPlays: 2,
    stimulus: { type: "audio_script", audioSrc: "/media/audio/placement-listening-LB.wav", lines: [
      { speaker: "Employee", text: "Hi, James. Do you have a minute? I'm working on the customer report, but I'm not sure how to handle one part of it." },
      { speaker: "Supervisor", text: "Sure. What's the problem?" },
      { speaker: "Employee", text: "The customer is asking for a refund, but the situation is a little unusual. I'm not sure which procedure applies." },
      { speaker: "Supervisor", text: "Have you checked the previous customer cases?" },
      { speaker: "Employee", text: "No, not yet." },
      { speaker: "Supervisor", text: "I'd start there. We had a very similar case last month, and the report might show you which procedure we followed." },
      { speaker: "Employee", text: "Okay. I'll check those records first." },
      { speaker: "Supervisor", text: "Good. If you still can't find the answer, come back to me. If you have any questions about the report, please speak to Sarah before we send it. We have to send the report today, but there may be some flexibility with the exact time." },
      { speaker: "Employee", text: "That's helpful. Thanks." }
    ] },
    tasks: [
      choice("LB_0", "What difficulty is the employee experiencing while preparing the customer report?", ["She cannot access the company website.", "She is unsure which procedure to follow for an unusual refund case.", "She cannot understand the language used in the customer's message.", "She cannot contact her supervisor."], 1, 1),
      choice("LB_1", "What does the supervisor suggest first?", ["Asking another department for help", "Checking previous customer records", "Calling the customer", "Sending the report immediately"], 1, 1),
      choice("LB_2", "Why does the supervisor suggest checking previous records?", ["They may contain a similar case.", "They contain the customer's personal information.", "They are required by company policy.", "They are easier to understand."], 0, 1),
      choice("LB_3", "What will the employee do next?", ["Contact the customer", "Check previous cases", "Rewrite the whole report", "Ask the IT department"], 1, 1),
      choice("LB_Q9", "Who should the listener contact?", ["David", "Sarah", "Tom", "James"], 1, 1),
      choice("LB_4", "What does the supervisor say about the deadline?", ["It cannot be changed.", "It has already passed.", "There may be some flexibility.", "The report is no longer necessary."], 2, 1)
    ]
  },
  {
    key: "LC", title: "Part C – Chính sách hybrid",
    instruction: "Nghe thảo luận và trả lời câu 11–15.", maxPlays: 2,
    stimulus: { type: "audio_script", audioSrc: "/media/audio/placement-listening-LC.wav", lines: [
      { speaker: "Anna", text: "So, what do you think about the new hybrid-work policy?" },
      { speaker: "Mark", text: "I think there are some advantages. People can probably concentrate better when they're working on tasks that require a lot of individual focus. But I'm concerned about communication." },
      { speaker: "Anna", text: "What do you mean?" },
      { speaker: "Mark", text: "When people aren't in the office, they may not hear about decisions that are made informally. Someone might have an important conversation in a meeting, for example, but another team member working remotely doesn't know about it." },
      { speaker: "Anna", text: "That's true. But I don't think that means the policy can't work. We probably need clearer communication procedures." },
      { speaker: "Mark", text: "Such as?" },
      { speaker: "Anna", text: "Important decisions could be documented in one shared system instead of relying on conversations or messages between individual employees." },
      { speaker: "Mark", text: "Yes. That could make the system more reliable." }
    ] },
    tasks: [
      choice("LC_0", "What is the main concern discussed?", ["Employee salaries", "Office space", "Communication between teams", "Employee training"], 2, 2),
      choice("LC_1", "What does Mark believe is one advantage of the new system?", ["Employees can work fewer hours.", "Employees can concentrate better on individual tasks.", "Managers can reduce staff numbers.", "Meetings will become unnecessary."], 1, 2),
      choice("LC_2", "What concern does Mark raise?", ["Some employees may receive less information.", "Employees may work too many hours.", "The office will become more expensive.", "Customers may complain about the policy."], 0, 2),
      choice("LC_3", "What does Anna suggest?", ["Cancelling the policy", "Increasing the number of meetings", "Establishing clearer communication procedures", "Requiring everyone to work in the office"], 2, 2),
      choice("LC_4", "What can be inferred about both speakers?", ["They completely disagree with the policy.", "They think the policy has potential but needs adjustments.", "They believe remote work is impossible.", "They think communication is not important."], 1, 2)
    ]
  }
];

const readingData: Array<[string, readonly string[], number]> = [
  ["Priya ____ a customer service agent.", ["are", "am", "is", "be"], 2],
  ["Marco needs to ____ the customer's problem.", ["sleep", "swim", "solve", "cook"], 2],
  ["Read this notice: \"The help desk is open from 9 to 5.\" When is the help desk open?", ["From 9 to 5", "From 5 to 9", "Only on Monday", "It is closed"], 0],
  ["The company has three ____ this week.", ["complaint", "complaint's", "complaints'", "complaints"], 3],
  ["Read this chat message: Customer: \"Hi, I have a problem with my refund.\" Agent: \"____\"", ["Hello! How can I help you?", "Hello! Where are you from originally?", "Hello! What is your favorite color?", "Hello! Goodbye and have a very nice day."], 0],
  ["The support office is closed on ____.", ["Twelve", "Angry", "Sunday", "Green"], 2],
  ["Samuel ____ the manager about his refund yesterday.", ["call", "called", "calling", "calls"], 1],
  ["The support team will ____ the complaint carefully before responding.", ["look after", "look for", "look out for", "look into"], 3],
  ["Read this email: \"Dear Ana, your refund of $45 will arrive in 5 business days. Thank you for your patience.\" How much is the refund?", ["$54", "$45", "5 days", "45 days"], 1],
  ["This month we received ____ complaints than last month.", ["few", "fewer", "less", "more little"], 1],
  ["Read this chat: Agent: \"Your order number, please?\" Customer: \"Sorry, ____?\"", ["could you repeat that", "I am doing fine today thank you", "see you later", "it is Tuesday afternoon today"], 0],
  ["Marco could not fix the problem, so he asked his ____ for help.", ["customer", "supervisor", "invoice", "deadline"], 1],
  ["Read these instructions: \"First, open the refund form. Next, enter your order number. Finally, click submit.\" What should you do after opening the form?", ["click submit and finish now", "enter your order number", "close the form", "call the manager on the phone"], 1],
  ["Nadia ____ three emails about her refund, but nobody has replied yet.", ["sent", "is sending", "send", "has sent"], 3],
  ["The manager decided to ____ a complaint seriously and offer a refund.", ["make", "do", "take", "have"], 2],
  ["Read this paragraph: \"Tomas ordered a laptop online, but it arrived with a cracked screen. He contacted customer support the same day and explained the problem. The company apologized, offered a full refund, and arranged for a courier to collect the damaged laptop the next morning. Tomas was satisfied with how quickly the issue was resolved.\" What is this paragraph mainly about?", ["A customer who forgot to pay", "A company resolving a customer's complaint quickly", "A courier company changing delivery schedule", "A laptop factory with quality problems"], 1],
  ["If the item arrives damaged, customers ____ contact support within 48 hours.", ["would", "should", "were", "did"], 1],
  ["Read this reply: \"Unfortunately, we ____ offer a refund after 30 days, but we can send a replacement part.\"", ["are unable to", "are happy to", "never wanted to", "always refuse to"], 0],
  ["The refund was approved; ____, it will take five days to appear in your account.", ["however", "otherwise", "as a result", "in order that"], 0],
  ["Read this paragraph: \"Priya called the support line four times this week about the same billing error. Each time, a different agent asked her to repeat the whole story from the beginning. By Friday, she asked to speak to a manager and canceled her subscription.\" What can you infer about Priya?", ["She was happy", "She never contacted", "She fixed it herself", "She was frustrated by having to repeat her problem repeatedly"], 3],
  ["Diego said that the refund ____ already been processed.", ["has", "had", "have", "was"], 1],
  ["Read this paragraph: \"Chen's email began politely, thanking the support team for their quick reply. However, by the third paragraph, his tone shifted: he listed every delay in bullet points and ended with, 'I trust this will finally be resolved, as I have already spent considerable time on this matter.' He did not use any angry words, but the message left little doubt about his patience running out.\" What does the passage suggest about Chen's attitude?", ["He is losing patience despite his polite wording", "He is completely satisfied", "He does not care", "He is thanking the team sincerely throughout"], 0],
  ["Which sentence is the most diplomatic way to reject a refund request?", ["No, you cannot have a refund.", "You should have read the policy before buying.", "We refuse your request.", "We understand your frustration, but unfortunately this falls outside our refund policy."], 3],
  ["The agent finally managed ____ the source of the billing error.", ["finding", "find", "to find", "founded"], 2],
  ["The support team will ____ the customer by email once the refund is complete.", ["notice", "note", "know", "notify"], 3],
  ["Read this paragraph: \"Lena's complaint email was forwarded to three different departments before anyone replied. When the reply finally came, it apologized for the delay and explained that the ticket had been mislabeled from the start. This explanation, while accurate, did little to change how Lena felt about the overall experience, since the damage to her trust in the company had already been done.\" What does 'this explanation' refer to?", ["Lena's original complaint", "The three different departments", "The explanation that the ticket had been mislabeled", "The refund policy"], 2],
  ["Which reply is appropriate for a formal complaint from a corporate client?", ["Oops, sorry about that, my bad!", "Yeah, we'll sort it out soon", "We sincerely apologize for the inconvenience and will resolve this promptly.", "Chill, it happens sometimes"], 2],
  ["____ had the refund been processed than the customer called again.", ["As soon", "Not until", "Hardly ever", "No sooner"], 3],
  ["Read this paragraph: \"The company claims that its new complaint-handling system has reduced resolution time by half. Internal data shows that the average ticket now closes in two days rather than four. However, customer satisfaction scores have barely moved, suggesting that speed alone has not addressed the underlying issue: many customers report receiving faster replies that still fail to solve their actual problem.\" What does the evidence in the passage actually support?", ["System completely failed", "Faster replies have not made customers meaningfully more satisfied", "Scores have doubled", "Takes four days to close"], 1],
  ["Which phrasing best de-escalates an angry customer without conceding fault prematurely?", ["I hear how frustrating this has been, and I want to understand exactly what happened.", "Calm down", "That's not our fault", "I don't see why you're upset"], 0],
  ["____ the complaint himself, Samuel understood why the customer was upset.", ["Handled", "To handle", "Having handled", "Handling having"], 2],
  ["Management announced that refund delays would be addressed ____ the board, not just for a few customers.", ["over", "across", "along", "through"], 1],
  ["Read this paragraph: \"Aisha filed her complaint on Monday, expecting a reply within 24 hours as promised. When Thursday arrived with still no response, she escalated the matter to a regional manager, who admitted that the promise had never been realistic given current staffing levels. It was this admission, more than the original delay, that convinced her to leave.\" What does 'this admission' refer to?", ["Aisha's decision", "The original delay", "Website policy", "The manager's statement that the 24-hour promise was never realistic"], 3],
  ["The refund offered was purely ____, meaning the company was not obligated to provide it.", ["mandatory", "contractual", "statutory", "discretionary"], 3],
  ["By the time the manager arrived, the customer ____ for over an hour, growing visibly more frustrated.", ["had been waiting", "was waiting", "has waited", "waited"], 0],
  ["Read this passage: \"Complaint-resolution metrics are frequently treated as proxies for customer trust, yet the two are only loosely correlated. What the data conceals is not the outcome itself but the customer's subjective sense of having been heard.\" Which statement does the passage actually support?", ["Fast ticket closure does not guarantee that a customer feels genuinely heard", "Stop measuring resolution time", "Trust is highest when tickets close quickly", "Systems accurately measure trust"], 0],
  ["Which reply communicates the next step without promising or denying a refund?", ["We will review your case and provide an update by Friday. The outcome has not yet been determined.", "You will receive a full refund by Friday.", "We cannot offer a refund under any circumstances.", "There is no possibility of compensation for your case."], 0],
  ["The customer's complaint was ultimately deemed ____, meaning it had no basis in the company's actual policy.", ["unfinished", "unfamiliar", "unfounded", "unforeseen"], 2],
  ["Read this line from an internal memo: \"The rollout of the new refund system was, shall we say, not without its complications.\" What does this sentence actually imply?", ["Rollout went perfectly", "System was canceled", "Writer is certain", "The rollout had significant problems"], 3],
  ["Neither the manager nor the agents ____ aware that the refund policy had changed overnight.", ["was", "is", "were", "has been"], 2]
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
  version: 3,
  totalMinutes: 70,
  totalScore: 100,
  sections: [
    { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: ["Mỗi đoạn nghe được phát tối đa 2 lần."], groups: listeningGroups },
    { code: "reading", title: "Đọc, Ngữ pháp & Từ vựng", durationMinutes: 20, maxScore: 40, instructions: ["40 câu, mỗi câu 1 điểm."], groups: readingGroups },
    { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: ["Mỗi task được chấm riêng theo 5 tiêu chí: task completion, organization, vocabulary, grammar và workplace register (mỗi tiêu chí 0–4)."], groups: [
      { key: "W1", title: "Task 1 – Phản hồi nhanh (7 phút · A2–B1)", instruction: "You receive this message from a colleague:", stimulus: { type: "message", text: "Hi! I need to take tomorrow morning off urgently for a family matter. Could you help me monitor the customer support inbox from 9 AM to 12 PM? I owe you one!" }, tasks: [
        { key: "W1", prompt: "Write a short reply (50–80 words): agree to help and ask whether there are any important tickets you should pay special attention to.", responseType: "long_text", maxScore: 7, minWords: 50, maxWords: 80 }
      ] },
      { key: "W2", title: "Task 2 – Báo cáo / đề xuất (13 phút · B2–C1)", instruction: "You work for a company that is updating its customer-service procedures. Your manager has sent you this message:", stimulus: { type: "message", text: "Hi,\nSeveral employees have said that they are sometimes unsure which customer-service procedure is the most recent one." }, tasks: [
        { key: "W2", prompt: "Write a formal email (120–150 words): explain one serious problem this confusion could cause (for example, giving a customer incorrect refund information) and propose one solution that helps the team find and use the latest documentation.", responseType: "long_text", maxScore: 13, minWords: 120, maxWords: 150 }
      ] }
    ] },
    { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: ["Ghi âm trực tiếp hoặc tải file âm thanh cho từng task (MP3, M4A, WAV, OGG hoặc WebM; tối đa 20 MB). Phần Nói chỉ nhận âm thanh để đánh giá nội dung; MVP không chấm phát âm."], groups: [
      { key: "S1", title: "Task 1 – Warm-up (3 phút · A1–A2)", instruction: "The examiner asks:", tasks: [
        { key: "S1", prompt: "1. What do you do?\n2. What are your main responsibilities?\n3. What English do you use at work?\n4. What is one situation in which you find English difficult?", responseType: "speaking_evidence", maxScore: 5, hint: "Trả lời lần lượt 4 câu hỏi, mỗi câu 2–4 câu nói." }
      ] },
      { key: "S2", title: "Task 2 – Data description (4 phút · B1–B2)", instruction: "You are in a team meeting. The table shows the number of customer complaints in the last three quarters. You have 30 seconds to look at the data. Then speak for 1–2 minutes:", stimulus: { type: "table", headers: ["Quarter", "Total complaints", "Most common issue"], rows: [["Q1", "120", "Delayed shipping"], ["Q2", "115", "Delayed shipping"], ["Q3", "280", "Software bugs"]] }, tasks: [
        { key: "S2", prompt: "1. Summarise the main trend in the numbers.\n2. Point out the biggest change in Q3.\n3. Suggest one short-term action the team should take to deal with the Q3 problem.", responseType: "speaking_evidence", maxScore: 5, hint: "Dùng từ vựng mô tả số liệu: increase, decrease, remain stable, the biggest change…" }
      ] },
      { key: "S3", title: "Task 3 – Customer refund questions (B2–C1)", instruction: "You are a Customer Support Specialist. A customer is frustrated because a promised refund has not arrived after five business days.", tasks: [
        { key: "S3_Q1", prompt: "How would you acknowledge the customer's frustration?", responseType: "speaking_evidence", maxScore: 0, hint: "Ghi âm câu trả lời ngắn, lịch sự và chuyên nghiệp." },
        { key: "S3_Q2", prompt: "What technical issue has delayed the refund?", responseType: "speaking_evidence", maxScore: 0, hint: "Ghi âm câu trả lời ngắn, lịch sự và chuyên nghiệp." },
        { key: "S3_Q3", prompt: "What clear next step would you propose?", responseType: "speaking_evidence", maxScore: 0, hint: "Ghi âm câu trả lời ngắn, lịch sự và chuyên nghiệp." },
        { key: "S3_Q4", prompt: "When can the customer expect a follow-up?", responseType: "speaking_evidence", maxScore: 0, hint: "Ghi âm câu trả lời ngắn, lịch sự và chuyên nghiệp." }
      ] },
      { key: "S4", title: "Task 4 – Monologue (4 phút · B2–C1)", instruction: "You are presenting to your team.", tasks: [
        { key: "S4", prompt: "Present the benefits and challenges of a centralised internal knowledge platform. Include examples and a conclusion.", responseType: "speaking_evidence", maxScore: 5, hint: "Nêu lợi ích, thách thức, ví dụ và kết luận." }
      ] }
    ] }
  ]
};

export const levelUpDefinition: StoredAssessmentDefinition = {
  key: "levelup-b1", kind: "level-up", title: "Đề thi lên mức B1", version: 1, totalMinutes: 35, totalScore: 100, targetLevel: "B1",
  sections: [
    { code: "listening", title: "Nghe", durationMinutes: 7, maxScore: 25, instructions: ["5 câu, mỗi câu 5 điểm."], groups: [{
      ...listeningGroups[0]!,
      instruction: "Nghe thông báo và trả lời 5 câu.",
      tasks: [
        ...listeningGroups[0]!.tasks.map((task) => ({ ...task, maxScore: 5 })),
        choice("LA_LEVEL_5", "What will the team discuss?", ["Next year's budget", "Last month's results", "A new office", "The holiday schedule"], 1, 5)
      ]
    }] },
    { code: "reading", title: "Đọc", durationMinutes: 11, maxScore: 25, instructions: ["5 câu, mỗi câu 5 điểm."], groups: [{ ...readingGroups[1]!, tasks: readingGroups[1]!.tasks.slice(0, 5).map((task) => ({ ...task, maxScore: 5 })) }] },
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
