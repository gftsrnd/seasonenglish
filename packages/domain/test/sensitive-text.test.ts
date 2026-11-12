import { describe, expect, it } from "vitest";
import { hasSensitiveText, hasSensitiveTopicText, sensitiveTextIssue, sensitiveTopicIssue, sensitiveTopicSeverity } from "../src/content/index.js";

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

describe("sensitiveTextIssue — added slurs and doubled-letter evasion (names too)", () => {
  it.each([
    "chingchong", "ching chong", "Ching-Chong", "ching chang chong", "chinky", "zipperhead", "slant eyes", "honky",
    "redskins", "jigaboo", "darkie", "shemale", "lesbo", "poofter", "spaz", "mongoloid", "wetbacks", "nigguh",
    "nazii", "naazi", "n4zii", "niggaa", "sexx", "s3xx", "fuckk", "pornn", "cocainee", "thằng mọi", "ô môi", "xăng pha nhớt",
    "xang pha nhot", "đồ thiểu năng"
  ])("flags %s", (text) => {
    expect(sensitiveTextIssue(text)).not.toBeNull();
  });

  it.each([
    // topic-only themes must NOT hit people's names or profile fields
    "Anna White", "Jack Black", "Gay Nguyen", "Marvin Gaye", "Christian Bale", "Les Paul", "Victoria Gunn", "Conn Smith",
    "Tran Thi Bich", "Lisa Trump", "Department of Religious Studies", "Security officer", "Head of Politics desk",
    "Le Van Lesley", "Chinese Language Teacher", "Black", "White", "Brown"
  ])("leaves the name/profile text %s alone", (text) => {
    expect(sensitiveTextIssue(text)).toBeNull();
  });
});

describe("sensitiveTopicIssue — topic-only categories", () => {
  it.each([
    // tester list
    ["lesbian", "identity"], ["gay", "identity"], ["bisexual", "identity"], ["transgender", "identity"],
    ["homosexual", "identity"], ["sex", "sexual"], ["nigga", "slur"], ["chingchong", "slur"], ["white people", "race"],
    ["black people", "race"], ["blackk people", "race"], ["nazii", "hate"], ["nazi", "hate"],
    // sexual orientation & gender identity
    ["Lesbians", "identity"], ["gays", "identity"], ["queer", "identity"], ["LGBT", "identity"], ["LGBTQ+", "identity"],
    ["lgbtqia", "identity"], ["trans people", "identity"], ["nonbinary", "identity"], ["non-binary", "identity"],
    ["gender identity", "identity"], ["sexual orientation", "identity"], ["drag queen", "identity"], ["pride month", "identity"],
    ["homosexuality", "identity"], ["intersex", "identity"], ["đồng tính", "identity"], ["người đồng tính", "identity"],
    ["nguoi dong tinh", "identity"], ["chuyển giới", "identity"], ["chuyen gioi", "identity"], ["người les", "identity"],
    ["song tính", "identity"], ["bê đê", "slur"], ["pê đê", "slur"],
    // race / ethnicity / nationality as a group
    ["white people", "race"], ["White People", "race"], ["whitepeople", "race"], ["white_people", "race"],
    ["white-people", "race"], ["black men", "race"], ["asian people", "race"], ["Asian women", "race"],
    ["african people", "race"], ["arab people", "race"], ["chinese people", "race"], ["vietnamese people", "race"],
    ["mexican guys", "race"], ["indian community", "race"], ["black lives matter", "race"], ["blacks", "race"],
    ["people of color", "race"], ["racism", "race"], ["racist jokes", "race"], ["racial", "race"],
    ["ethnicity", "race"], ["ethnic minority", "race"], ["skin colour", "race"], ["skin color", "race"],
    ["caucasian people", "race"], ["mixed race people", "race"], ["người da đen", "race"], ["nguoi da den", "race"],
    ["người da trắng", "race"], ["người da màu", "race"], ["chủng tộc", "race"], ["chung toc", "race"], ["sắc tộc", "race"],
    ["dân tộc thiểu số", "race"], ["kỳ thị chủng tộc", "race"], ["phân biệt chủng tộc", "race"],
    // religion as a group & extremism
    ["religion", "religion"], ["religious people", "religion"], ["muslims", "religion"], ["muslim people", "religion"],
    ["jews", "religion"], ["jewish people", "religion"], ["christians", "religion"], ["islam", "religion"],
    ["jihad", "religion"], ["ISIS", "religion"], ["al-qaeda", "religion"], ["taliban", "religion"],
    ["extremism", "religion"], ["terror group", "religion"], ["tôn giáo", "religion"], ["ton giao", "religion"],
    ["hồi giáo", "religion"], ["do thái", "religion"],
    // politics
    ["politics", "politics"], ["political party", "politics"], ["election", "politics"], ["communist", "politics"],
    ["communism", "politics"], ["democracy", "politics"], ["dictator", "politics"], ["Hitler", "politics"],
    ["hittler", "politics"], ["H1tler", "politics"], ["putin", "politics"], ["Donald Trump", "politics"],
    ["kim jong un", "politics"], ["xi jinping", "politics"], ["protest", "politics"], ["chính trị", "politics"],
    ["chinh tri", "politics"], ["bầu cử", "politics"], ["cộng sản", "politics"], ["đảng cộng sản", "politics"],
    ["biểu tình", "politics"], ["tổng thống", "politics"],
    // sexual beyond the general list
    ["sexual", "sexual"], ["sexuality", "sexual"], ["sexxy", "sexual"], ["s3xy", "sexual"], ["sexiest", "sexual"],
    ["condom", "sexual"], ["erotic", "sexual"], ["lingerie", "sexual"], ["strip club", "sexual"],
    ["sexual harassment", "sexual"], ["bao cao su", "sexual"], ["gợi cảm", "sexual"],
    // weapons
    ["gun", "weapons"], ["guns", "weapons"], ["rifle", "weapons"], ["weapon", "weapons"], ["firearms", "weapons"],
    ["machine gun", "weapons"], ["AK-47", "weapons"], ["grenade", "weapons"], ["missile", "weapons"],
    ["assassin", "weapons"], ["súng", "weapons"], ["súng trường", "weapons"], ["vũ khí", "weapons"], ["vu khi", "weapons"],
    ["lựu đạn", "weapons"],
    // gambling
    ["casino", "gambling"], ["casinos", "gambling"], ["betting", "gambling"], ["sports betting", "gambling"],
    ["gambling", "gambling"], ["poker", "gambling"], ["roulette", "gambling"], ["slot machine", "gambling"],
    ["cá độ", "gambling"], ["cờ bạc", "gambling"], ["đánh bạc", "gambling"], ["cá cược", "gambling"], ["lô đề", "gambling"],
    // drugs & alcohol abuse
    ["drugs", "drugs"], ["drug addiction", "drugs"], ["overdose", "drugs"], ["getting drunk", "drugs"],
    ["drunk driving", "drugs"], ["alcoholism", "drugs"], ["smoking weed", "drugs"], ["vaping", "drugs"],
    ["say rượu", "drugs"], ["ma túy", "drugs"],
    // crime
    ["crime", "crime"], ["criminals", "crime"], ["robbery", "crime"], ["kidnapping", "crime"], ["human trafficking", "crime"],
    ["mafia", "crime"], ["money laundering", "crime"], ["tội phạm", "crime"], ["bắt cóc", "crime"], ["rửa tiền", "crime"],
    // death / violence / self-harm
    ["death", "violence"], ["dead bodies", "violence"], ["corpse", "violence"], ["violence", "violence"],
    ["domestic violence", "violence"], ["world war", "weapons"], ["cái chết", "violence"], ["chiến tranh", "violence"],
    ["bạo lực", "violence"], ["want to die", "self_harm"], ["suicide", "self_harm"], ["tự tử", "self_harm"]
  ])("refuses the topic %s (%s)", (text, category) => {
    expect(sensitiveTopicIssue(text)?.category).toBe(category);
  });

  it.each([
    "l3sbian", "g@y", "gayy", "GaY", "g a y", "l.e.s.b.i.a.n", "bisexuall", "transgenderr", "lgbtqplus", "whitepeoplee",
    "whiteeee people", "WHITE   PEOPLE", "blackkpeople", "bl4ck people", "asianpeople", "chiiinese people",
    "c4sino", "casinoo night", "gunss", "hitlerr", "j1had", "rac1sm", "seexual", "s e x u a l", "nguoi da trang",
    "racial-profiling", "theblackpeople"
  ])("sees through the topic trick %s", (text) => {
    expect(sensitiveTopicIssue(text)).not.toBeNull();
  });

  // ~100 ordinary workplace / everyday topics and words: none of them may be refused.
  it.each([
    "coffee shop", "meeting", "black coffee", "white board", "whiteboard", "white wine", "black tea", "Black Friday",
    "black belt", "white paper", "white collar", "blackboard", "black and white photos", "brown rice", "yellow pages",
    "red wine", "green tea", "grape", "grape harvest", "analysis", "analyst", "class schedule", "Sussex office",
    "Essex", "Scunthorpe", "assess", "assessment", "address", "success", "book", "bookkeeping", "coffee", "office",
    "cocktail", "cocktail bar", "Dick's Sporting Goods", "therapist", "skill", "skills", "classic cars", "glass",
    "grass", "boss", "kiss", "less paper", "paperless", "pass", "passport", "class", "mass media", "guess",
    "Chinese food", "Japanese culture", "Korean BBQ", "Asian cuisine", "American English", "British accent",
    "Indian restaurant", "Thai food", "native speaker", "typing race", "car race", "gender equality", "diversity",
    "immigration office", "foreigners", "beer", "wine tasting", "pub quiz", "smoking area", "pharmacy", "drugstore",
    "medicine", "Christmas", "Christmas party", "Easter", "Tet holiday", "church wedding", "temple", "pagoda",
    "government office", "vote", "marketing campaign", "birthday party", "president", "chairman", "fraud",
    "phishing", "identity theft", "harassment policy", "funeral", "hospital", "insurance", "lottery", "kitchen knife",
    "scissors", "bullet points", "photo shooting", "deadline", "Ho Chi Minh City", "proof of concept", "pros and cons",
    "non-alcoholic drinks", "segregation of duties", "regime", "dress code", "job interview", "customer service",
    "sales report", "team building", "annual leave", "airport", "hotel check-in", "restaurant", "supermarket",
    "public transport", "weather", "football", "chicken breast", "skin care", "black leather shoes", "da thật",
    "cả cuộc họp", "kỳ thi", "đọc tài liệu", "đồng tình", "lương tính theo giờ", "bát cốc", "cô bác", "cá đỏ",
    "giày da đen", "kem dưỡng da trắng", "lo để làm", "dao chính", "Les Misérables", "classes", "assessor", "putting green",
    "Gunn",
    // Vietnamese words that fold onto a listed English word ("gây" → gay, "cụm" → cum, "thái màn" → thai man)
    "gây tiếng ồn", "bị gãy", "người gầy", "cụm từ", "trạng thái màn hình", "dùng be để", "gửi lại mã (45s)", "code chết"
  ])("allows the ordinary topic %s", (text) => {
    expect(sensitiveTopicIssue(text)).toBeNull();
  });

  it("checks several generated strings at once", () => {
    expect(hasSensitiveTopicText("coffee", "cà phê", "a hot drink")).toBe(false);
    expect(hasSensitiveTopicText("casino", "sòng bạc")).toBe(true);
    expect(hasSensitiveTopicText("chip", "chip", "a token used at a casino")).toBe(true);
    // general screen stays narrow: topic-only words are not flagged there
    expect(hasSensitiveText("white people", "casino", "gay")).toBe(false);
    expect(sensitiveTextIssue("assassin")).toBeNull();
    expect(sensitiveTextIssue("sexual harassment policy")).toBeNull();
    expect(sensitiveTopicIssue("sexual harassment policy")?.category).toBe("sexual");
  });
});

describe("sensitiveTopicSeverity", () => {
  it.each(["n1gger", "f*ck meeting", "porn", "khiêu dâm", "ma túy", "self-harm"])("treats %s as abusive (immediate strike)", (text) => {
    expect(sensitiveTopicSeverity(text)?.severity).toBe("abusive");
  });

  it.each(["lesbian", "gay", "white people", "religion", "politics", "guns", "casino", "crime", "Hitler", "sexuality"])(
    "treats the theme %s as unsuitable (soft refusal)", (text) => {
      expect(sensitiveTopicSeverity(text)?.severity).toBe("unsuitable");
    }
  );

  it("returns null for everyday topics", () => {
    expect(sensitiveTopicSeverity("coffee shop")).toBeNull();
    expect(sensitiveTopicSeverity("")).toBeNull();
  });
});
