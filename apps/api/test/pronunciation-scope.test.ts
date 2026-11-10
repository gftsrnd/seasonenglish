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
});
