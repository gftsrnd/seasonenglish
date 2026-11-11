/**
 * Level-up form fixtures. The two passages and the three wrong-key questions
 * are copied verbatim from the 11/11/2026 AI-quality run
 * (`.artifacts/ai-quality-2026-11-11/out/levelup-b1.json`, `levelup-b1-r3.json`;
 * report section 6, "3 đáp án sai đã xác nhận").
 */
export interface FixtureChoice { prompt: string; options: string[]; correctIndex: number }

export const B1_HANDOVER_PASSAGE = `Riverside Logistics – Warehouse Memo: Changes to Shift Handovers

From: Hannah Morris, Operations Manager
To: All warehouse staff
Date: 14 March

Starting next Monday, we will change the way shift handovers work at the Riverside depot. At the moment, each team leader writes a short paper note at the end of the shift. Unfortunately, these notes are often unclear, and the morning team sometimes does not know which orders are still waiting. From now on, every team leader must enter the handover information into the new shared app on the depot tablets before leaving. The app will show a list of unfinished orders, damaged items and vehicles that need repairs.

Please note the following points:
1. The handover must be completed at least 15 minutes before the end of your shift. This gives the next team time to read the information and ask questions.
2. If an order is delayed, you must write the reason in the "Comments" box. Do not write only "pending" or "waiting."
3. Paper notes will no longer be accepted after Friday 21 March.
4. Training sessions will take place on Thursday and Friday in Room B, at 7:30 a.m. and 2:30 p.m. Both sessions last 45 minutes. Staff who cannot attend should contact Tomasz Nowak in the training office to book a different time.

We understand that some people feel uncomfortable with new technology. If you need help, please speak to your team leader first. Our IT colleague, Priya Desai, will also be available on the shop floor during the first two weeks to answer questions.

We believe this change will reduce mistakes, save time and make the depot a safer place to work. Thank you for your cooperation.

Hannah Morris

---

Note from Team Leader, Night Shift (Dariusz Kowalski):
Hi Hannah, the night team is happy with the app idea, but we have one concern. Our tablets are old and sometimes the screen freezes. Could IT check them before Thursday's training? Thanks, Dariusz`;

export const B1_RETURNS_PASSAGE = `Northgate Logistics – Internal Memo: Changes to the Returns Process

From: Helen Park, Operations Manager
To: All Warehouse and Customer Service Staff
Date: 3 March

Starting next Monday, we are changing how customer returns are handled at the Riverside depot. The main reason is that too many returned items were waiting more than five days before they were checked. This caused complaints from customers and delays in refunds.

Under the new process, every returned item must be scanned at the loading dock within two hours of arrival. Staff will then record the condition of the item in the system using one of three codes: A (like new), B (minor damage), or C (unsellable). Items coded A return to stock the same day. Items coded B are sent to the repair area on the second floor. Items coded C must be placed in the grey bins by the east door, where the recycling team collects them every Thursday.

Customer Service will no longer approve refunds by phone for orders over £200. These cases must be reviewed by a supervisor, who will check the scanned condition code and the photographs uploaded by the customer. Supervisors aim to respond within 24 hours. Please let your team leader know if you need training on the photo upload tool; a session is planned for Wednesday at 2 p.m. in Meeting Room B.

Staff who work night shifts should note that the scanning station on the loading dock will be open from 6 a.m. to 10 p.m. Outside these hours, returns should be left in the designated holding area marked with yellow tape, and scanned at the start of the next shift.

Please direct any questions to me by email before Friday. We expect some difficulties during the first two weeks, and your feedback will help us improve the process.`;

/** Wrong key 1: two sessions are listed (7:30 and 2:30), the key says three. */
export const WRONG_KEY_HOW_MANY: FixtureChoice = { prompt: "How many training sessions are listed per day?", options: ["Once", "Twice", "Three times", "Four times"], correctIndex: 2 };
/** Wrong key 2: damaged items ARE listed; customer complaints are not. */
export const WRONG_KEY_NOT_LISTED: FixtureChoice = { prompt: "Which item is NOT listed as something the app will show?", options: ["Unfinished orders", "Damaged items", "Vehicles that need repairs", "Customer complaints"], correctIndex: 1 };
/** Wrong key 3: supervisors DO check the photographs. */
export const WRONG_KEY_PHOTOGRAPHS: FixtureChoice = { prompt: "Which statement about photographs is correct?", options: ["Supervisors will check the photos before approving large refunds", "Supervisors will not check any photos", "Customers will check their own photos", "Photos are no longer needed"], correctIndex: 1 };

const PART_TOPICS = [
  "Maya from Northwind Travel books a flight for the sales visit and changes the hotel.",
  "Leo at Bluepeak Bank explains the new password reset steps to the support desk.",
  "Ana in the Harbor Foods finance team asks for receipts before the monthly close.",
  "Sam from Cedar Media moves the client meeting because the projector is broken.",
  "Ravi at Orbit Software welcomes two interns and shows them the onboarding checklist."
];

export const LISTENING_SCRIPT = PART_TOPICS.map((topic, index) => `Part ${index + 1}\n${topic} The speaker repeats the key details clearly for everyone.`).join("\n\n");

/** Same-length options, distinct prompts, no NOT/how-many/statement questions. */
export function neutralQuestions(section: "listening" | "reading", count: number, keyAt: (index: number) => number = (index) => index % 4): FixtureChoice[] {
  return Array.from({ length: count }, (_, index) => ({
    prompt: `${section} question ${index + 1}: what does the speaker ask for in item ${index + 1}?`,
    options: ["alpha", "bravo", "charl", "delta"].map((word) => `${word} ${section.slice(0, 1)}${String(index + 1).padStart(2, "0")}`),
    correctIndex: keyAt(index)
  }));
}

export function gateInput(overrides: { listening?: FixtureChoice[]; reading?: FixtureChoice[]; readingPassage?: string; listeningScript?: string; listeningParts?: string[] | null } = {}) {
  const listeningScript = overrides.listeningScript ?? LISTENING_SCRIPT;
  return {
    listeningParts: overrides.listeningParts !== undefined ? overrides.listeningParts : PART_TOPICS.map((topic) => `${topic} The speaker repeats the key details clearly for everyone.`),
    listeningScript,
    listening: overrides.listening ?? neutralQuestions("listening", 20),
    readingPassage: overrides.readingPassage ?? B1_HANDOVER_PASSAGE,
    reading: overrides.reading ?? neutralQuestions("reading", 40)
  };
}

/** Reading list of 40 with one real question placed at `position`. */
export function readingWith(question: FixtureChoice, position = 13): FixtureChoice[] {
  const reading = neutralQuestions("reading", 40);
  reading[position] = question;
  return reading;
}

/** The three AI slices, all keys at index 1 (the "B" bias seen in DB `level-up-b1` v1). */
export function aiSlices(reading: FixtureChoice[] = neutralQuestions("reading", 40, () => 1), passage = B1_HANDOVER_PASSAGE) {
  return {
    listening: { title: "Workplace English B1 Promotion Test", script: LISTENING_SCRIPT, questions: neutralQuestions("listening", 21, () => 1) },
    reading: { passage, questions: reading },
    production: {
      writingPrompts: ["Write a short reply to your manager about the new handover app.", "Write an email proposing a better training schedule for your team."],
      speakingPrompts: ["Describe a change at your workplace and how you felt about it.", "Explain to a new colleague how to report a delayed order.", "Give your opinion on paper notes versus a shared app at work.", "Suggest one way to make the depot a safer place to work."]
    }
  };
}
