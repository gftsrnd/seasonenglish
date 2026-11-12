import { describe, expect, it } from "vitest";
import { hasSensitiveText, sensitiveTextIssue } from "../src/content/index.js";

describe("sensitiveTextIssue", () => {
  it.each([
    ["nigger", "slur"], ["Niggers", "slur"], ["faggot", "slur"], ["chink", "slur"],
    ["fuck", "profanity"], ["shit", "profanity"], ["asshole", "profanity"], ["bitch", "profanity"],
    ["porn", "sexual"], ["sex", "sexual"], ["nude photos", "sexual"], ["child porn", "sexual"],
    ["white power", "hate"], ["nazi", "hate"],
    ["murder", "violence"], ["how to kill", "violence"], ["school shooting", "violence"], ["bomb making", "violence"],
    ["suicide", "self_harm"], ["self-harm", "self_harm"], ["kill myself", "self_harm"],
    ["cocaine", "drugs"], ["drug dealer", "drugs"], ["meth lab", "drugs"]
  ])("flags English %s as %s", (text, category) => {
    expect(sensitiveTextIssue(text)?.category).toBe(category);
  });

  it.each([
    ["ma túy", "drugs"], ["ma tuy", "drugs"], ["MA TÚY ĐÁ", "drugs"], ["thuốc phiện", "drugs"], ["cần sa", "drugs"],
    ["khiêu dâm", "sexual"], ["khieu dam", "sexual"], ["hiếp dâm", "sexual"], ["làm tình", "sexual"],
    ["giết người", "violence"], ["khủng bố", "violence"], ["tự tử", "self_harm"], ["treo cổ", "self_harm"],
    ["địt mẹ", "profanity"], ["đm", "profanity"], ["vcl", "profanity"], ["lồn", "profanity"], ["cặc", "profanity"],
    ["bê đê", "slur"], ["tàu khựa", "slur"]
  ])("flags Vietnamese %s as %s", (text, category) => {
    expect(sensitiveTextIssue(text)?.category).toBe(category);
  });

  it.each([
    "n1gger", "f u c k", "f.u.c.k", "f_u_c_k", "fuuuuck", "f*ck", "sh*t", "$hit", "sh1t", "a$$hole", "p0rn",
    "5ex", "s e x", "k1ll", "c0caine", "FuCkInG", "fuckface", "xxpornxx", "motherf*cker", "s-u-i-c-i-d-e", "asss"
  ])("sees through the trick %s", (text) => {
    expect(sensitiveTextIssue(text)).not.toBeNull();
  });

  it.each([
    "coffee shop", "meeting", "class", "assess", "assessment", "Scunthorpe", "Sussex", "Essex", "skills", "classic cars",
    "Dick's Sporting Goods", "passport", "bass guitar", "analysis", "cocktail", "grape harvest", "therapist",
    "sniggering", "pass the exam", "2024 budget", "3D printing", "B2B sales", "Room 101",
    "Hancock", "shiitake", "cockpit", "button", "document", "Arsenal", "massage therapy", "hello!",
    // Vietnamese words that only resemble a bad term once diacritics are dropped
    "mọi người", "từ từ", "các bạn", "lon bia", "điểm danh", "đủ rồi", "đèo Hải Vân", "treo cờ", "khoa thận", "làm tính",
    "sexual harassment policy"
  ])("allows ordinary text %s", (text) => {
    expect(sensitiveTextIssue(text)).toBeNull();
  });

  it("ignores empty input and checks several strings at once", () => {
    expect(sensitiveTextIssue("")).toBeNull();
    expect(sensitiveTextIssue(null)).toBeNull();
    expect(hasSensitiveText("coffee", "cà phê")).toBe(false);
    expect(hasSensitiveText("coffee", "ma túy")).toBe(true);
  });
});
