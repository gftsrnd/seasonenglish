import { describe, expect, it } from "vitest";
import { grammarExampleMatcher, grammarExampleSegments, grammarFormulaSegments, type HighlightSegment } from "./study-highlight.js";

const show = (segments: HighlightSegment[]) => segments.map((segment) => segment.mark ? `[${segment.text}]` : segment.text).join("");
const example = (formula: string, sentence: string) => show(grammarExampleSegments(sentence, grammarExampleMatcher([formula])));
const formula = (line: string) => show(grammarFormulaSegments(line));

describe("ending slots after a verb placeholder", () => {
  it("marks -ed verbs of the examples for verb + -ed (live B1 lesson)", () => {
    const line = "Past simple: verb + -ed";
    expect(formula(line)).toBe("Past simple: [verb] + [-ed]");
    expect(example(line, "Yesterday, our team finished the review on time.")).toBe("Yesterday, our team [finished] the review on time.");
    expect(example(line, "Last month, we adjusted the plan regularly after the client call.")).toBe("Last month, we [adjusted] the plan regularly after the client call.");
  });

  it("keeps the -ed / -ing stoplist and words after a determiner plain", () => {
    expect(example("Past simple: verb + -ed", "We need a red folder for the updated file.")).toBe("We need a red folder for the updated file.");
    expect(example("verb + -ing", "Nothing is planned for the morning; we are fixing the ceiling during lunch.")).toBe("Nothing is planned for the morning; we are [fixing] the ceiling during lunch.");
  });

  it("marks the named -ing form where no auxiliary comes before it", () => {
    expect(example("be + on track / at risk of + V-ing", "The project is at risk of slipping by about one week.")).toBe("The project is at risk of [slipping] by about one week.");
  });
});

describe("connectors and tense-name slots", () => {
  const line = "past continuous + when/while + past simple";

  it("marks the tense names and the connectors in the formula", () => {
    expect(formula(line)).toBe("[past continuous] + [when/while] + [past simple]");
  });

  it("marks the connector, the was/were + V-ing form and the past simple verb (live B1 lesson)", () => {
    expect(example(line, "While the team was reviewing the plan, the manager called a short break.")).toBe("[While] the team [was] [reviewing] the plan, the manager [called] a short break.");
    expect(example(line, "When the client asked for changes, we adjusted the schedule.")).toBe("[When] the client [asked] for changes, we [adjusted] the schedule.");
  });

  it("marks a tense auxiliary only together with its verb form", () => {
    expect(example("present continuous + when + past simple", "The review meeting is on Thursday.")).toBe("The review meeting is on Thursday.");
    expect(example("Subject + present perfect", "We have sent the file.")).toBe("We [have] [sent] the file.");
    expect(example("Subject + present perfect", "We have a meeting.")).toBe("We have a meeting.");
  });

  it("marks irregular past forms only when the formula lists them", () => {
    const listed = "Past simple: Subject + verb-ed / irregular past (I finished the report, then I sent it)";
    expect(example(listed, "Last quarter, I finished the sales report and sent it to my manager.")).toBe("Last quarter, I [finished] the sales report and [sent] it to my manager.");
    expect(example(line, "The team sent the report.")).toBe("The team sent the report.");
  });

  it("marks tense names that lead each side of a no-plus comparison", () => {
    const compare = "Present Simple cho lịch cố định / Present Continuous cho việc đang làm tạm thời";
    expect(formula(compare)).toBe("[Present Simple] cho lịch cố định / [Present Continuous] cho việc đang làm tạm thời");
    expect(example(compare, "Our staff sends a quick update every Monday, but we are sending the solution today.")).toBe("Our staff sends a quick update every Monday, but we [are] [sending] the solution today.");
  });

  it("marks a list of coordinators but never a coordinator alone", () => {
    expect(formula("Clause 1 + and/but/or/so/because + Clause 2")).toBe("Clause 1 + [and/but/or/so/because] + Clause 2");
    expect(grammarExampleMatcher(["Clause 1 + so + Clause 2"])).toBeNull();
  });
});

describe("short phrases compared with vs", () => {
  const line = "have got (now) vs had (past)";

  it("marks each phrase in the formula, not the note in parentheses (live B1 lesson)", () => {
    expect(formula(line)).toBe("[have got] (now) vs [had] (past)");
  });

  it("marks the phrases wherever they occur in the examples", () => {
    expect(example(line, "Now I have got a productive team, but last year I had a smaller one.")).toBe("Now I [have] [got] a productive team, but last year I [had] a smaller one.");
    expect(example(line, "I used to have a small team, but I did not have much support.")).toBe("I used to have a small team, but I did not have much support.");
  });

  it("leaves long or plus-pattern sides alone", () => {
    expect(formula("the thing we planned last year vs what happened")).toBe("the thing we planned last year vs what happened");
  });
});

describe("other common live patterns", () => {
  it("marks the shared negative of a pronoun list (I/We/They don't)", () => {
    const line = "I/We/They don't + verb; He/She/It doesn't + verb; Do/Does + chủ ngữ + verb?";
    expect(formula(line)).toBe("I/We/They [don't] + [verb]; He/She/It [doesn't] + [verb]; [Do/Does] + chủ ngữ + [verb]?");
    expect(example(line, "The client doesn't agree with the new deadline.")).toBe("The client [doesn't] [agree] with the new deadline.");
  });

  it("reads Vietnamese verb placeholders and the -s verb after a one-word subject", () => {
    const line = "I/We/They + động từ nguyên mẫu; He/She/It + động từ thêm -s";
    expect(formula(line)).toBe("I/We/They + [động từ nguyên mẫu]; He/She/It + [động từ thêm -s]");
    expect(example(line, "We send a progress report every Friday.")).toBe("We [send] a progress report every Friday.");
    expect(example(line, "The developer checks the feedback daily.")).toBe("The developer [checks] the feedback daily.");
    // Unsure subjects stay plain: a plural noun before the verb, or the verb followed by a noun.
    expect(example(line, "Our team members work from home.")).toBe("Our team members work from home.");
  });

  it("splits labelled clauses on one line", () => {
    expect(formula("Fact/routine: subject + present simple; temporary now: subject + am/is/are + verb-ing")).toBe("Fact/routine: subject + [present simple]; temporary now: subject + [am/is/are] + [verb-ing]");
  });

  it("marks pronoun tables and reporting verbs", () => {
    const pronouns = "I / he / they (chủ ngữ) + động từ; my / his / their + danh từ";
    expect(example(pronouns, "His team works on the mobile app.")).toBe("[His] team works on the mobile app.");
    const reported = "reporting verb + object + to-infinitive";
    expect(example(reported, "The client asked us to prioritize the login fixes for the next sprint.")).toBe("The client [asked] us [to] [prioritize] the login fixes for the next sprint.");
  });

  it("marks only the auxiliary of a pronoun contraction", () => {
    const line = "Subject + am/is/are + stative verb (love, hate, want, need) + object";
    expect(example(line, "I'm loving the new dashboard.")).toBe("I['m] [loving] the new dashboard.");
  });
});
