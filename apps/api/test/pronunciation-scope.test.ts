import {describe,it,expect} from "vitest";
import {pronunciationWordsForLesson} from "../src/modules/learning/routes.js";
import {hasExactTargetOccurrences} from "../src/modules/content/monthly-quality.js";
describe("complete monthly pronunciation scope", () => {
 it("requires the visible complete scope instead of the hidden compact primary summary", () => {
 const words = Array.from({length:8},(_,i) => ({word:"word"+i}));
 expect(pronunciationWordsForLesson({content:{parts:[{code:"pronunciation",content:{words:[{word:"hidden"}],reviewTargets:[{words:words.slice(0,2)},{words:words.slice(2,4)},{words:words.slice(4,6)},{words:words.slice(6)}]}}]}})).toEqual(words.map(row => row.word));
 });
 it("rejects repeated targets and substrings in a read-aloud passage", () => {
 expect(hasExactTargetOccurrences("Think and thank them.",["think","thank"])).toBe(true);
 expect(hasExactTargetOccurrences("Think, think and thank them.",["think","thank"])).toBe(false);
 expect(hasExactTargetOccurrences("Thinking and thankful.",["think","thank"])).toBe(false);
 });
 it("counts a word inside a linking phrase as the phrase's position, not an extra one (B1 23/12)", () => {
 const words = ["asked","checked","called","planned","started","needed","checked it","called us"];
 const passage = "Yesterday I asked the team to join a short call. Before the call, I checked the testing report and called us to confirm the details. We planned the next steps, and the team started the update at noon. Everyone needed a clear list, so I checked it again and finished the summary on time.";
 expect(hasExactTargetOccurrences(passage, words)).toBe(false); // "called" appears only inside "called us"
 expect(hasExactTargetOccurrences(passage.replace("and called us to confirm", "called the client, and called us to confirm"), words)).toBe(true);
 expect(hasExactTargetOccurrences(passage.replace("I checked the testing report", "I read the testing report"), words)).toBe(false);
 });
});
