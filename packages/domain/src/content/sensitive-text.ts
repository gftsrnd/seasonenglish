/**
 * Deterministic sensitive-text screen for learner free text that feeds AI generation or is shown to
 * other people (custom topics, display names, …). It works without any AI provider.
 *
 * Matching is whole-word on a normalised token stream (lower case, diacritics folded, leetspeak
 * mapped, letter runs squeezed, spaced-out letters re-joined) so ordinary words that merely contain a
 * bad substring ("class", "assess", "Scunthorpe", "Sussex", "skills") stay allowed. A short list of
 * unambiguous strong terms is additionally matched as a substring inside a single token
 * ("fuckface", "xxpornxx"). Vietnamese words that only become offensive once diacritics are removed
 * ambiguously (e.g. "lồn" vs "lon" = can, "các" vs "cặc") are matched with their diacritics intact.
 * Doubled-letter evasions ("nazii", "blackk people", "sexx") are caught by comparing tokens that
 * contain a repeated letter with every letter run collapsed to one ("nazii" → "nazi"); tokens typed
 * without a repeat never use this path, so "cons" cannot collide with "coon" and "as" never with "ass".
 *
 * Two entry points:
 * - `sensitiveTextIssue` — slurs, profanity, sexual, hate, violence, self-harm, drugs. Used for people's
 *   names and profile fields, where broader theme words would hit real names ("White", "Black", "Gay").
 * - `sensitiveTopicIssue` — the above plus TOPIC-ONLY themes that do not belong in a workplace
 *   English mini-game (see TOPIC_FOLDED_TERMS): sexual orientation & gender identity, race/ethnicity/
 *   nationality as a group of people, religion as a group & extremism, politics & political figures,
 *   wider sexual content, weapons, gambling, alcohol abuse/drug use, crime, death. Used for custom
 *   mini-game topics and for every AI-generated word of a word set.
 */

export type SensitiveTextCategory =
  | "slur" | "profanity" | "sexual" | "hate" | "violence" | "self_harm" | "drugs"
  // Topic-only categories (never returned by sensitiveTextIssue)
  | "identity" | "race" | "religion" | "politics" | "weapons" | "gambling" | "crime";

export interface SensitiveTextIssue {
  category: SensitiveTextCategory;
  /** Canonical list term that matched (never the learner's raw text). */
  term: string;
}

/** Default Vietnamese learner-facing rejection for unsafe topics. */
export const SENSITIVE_TOPIC_MESSAGE_VI =
  "Chủ đề này không phù hợp. Hãy chọn một chủ đề công việc hoặc đời sống, ví dụ: coffee shop, meeting.";

/** Gentle Vietnamese refusal for a mini-game topic whose theme is unsuitable but not abusive (no strike). */
export const UNSUITABLE_TOPIC_MESSAGE_VI =
  "Chủ đề này không phù hợp với Mini game. Hãy chọn một chủ đề công việc hoặc đời sống, ví dụ: coffee shop, meeting.";

/** Default Vietnamese learner-facing rejection for unsafe names shown to others. */
export const SENSITIVE_NAME_MESSAGE_VI =
  "Tên này không phù hợp. Hãy dùng tên thật hoặc một tên lịch sự.";

/** Terms matched after diacritics are folded ("ma túy" == "ma tuy"). Multi-word entries match as token sequences and also in their joined form. */
const FOLDED_TERMS: Partial<Record<SensitiveTextCategory, readonly string[]>> = {
  slur: [
    "nigger", "niggers", "nigga", "niggas", "negro", "negroes", "chink", "chinks", "gook", "gooks", "spic", "spics",
    "wetback", "wetbacks", "kike", "kikes", "faggot", "faggots", "fag", "fags", "dyke", "dykes", "tranny", "trannies",
    "retard", "retards", "retarded", "coon", "coons", "raghead", "towelhead", "beaner", "beaners", "paki", "pakis",
    "sand nigger", "porch monkey", "niggah", "nigguh", "nigaz", "chingchong", "ching chong", "ching chang chong",
    "chinky", "chinaman", "jap", "japs", "zipperhead", "slant eye", "slant eyes", "slanteye", "slanteyes", "wog", "wogs",
    "dago", "dagos", "polack", "polacks", "honky", "honkies", "redskin", "redskins", "injun", "injuns", "squaw",
    "half breed", "halfbreed", "jigaboo", "jungle bunny", "darkie", "darkies", "darky", "golliwog", "nignog", "nig nog",
    "shemale", "she male", "trannie", "lesbo", "lesbos", "lezzie", "lezbo", "poofter", "batty boy", "spaz", "mongoloid",
    "midget", "midgets",
    // Vietnamese (safe to match without diacritics)
    "bede", "be de", "pede", "pe de", "tau khua", "xang pha nhot"
  ],
  profanity: [
    "fuck", "fucks", "fucked", "fucker", "fuckers", "fucking", "fuckin", "fck", "fuk", "fuking", "motherfucker",
    "motherfuckers", "shit", "shits", "shitty", "bullshit", "bitch", "bitches", "bastard", "bastards", "asshole",
    "assholes", "ass", "arse", "arsehole", "dumbass", "jackass", "cunt", "cunts", "twat", "wanker", "wankers",
    "prick", "dickhead", "dickheads", "cocksucker", "piss", "wtf", "stfu", "suck my dick", "son of a bitch",
    // Vietnamese
    "dit me", "dit con me", "dit cu", "dcm", "dkm", "dmm", "dmcs", "vcl", "vkl", "vl", "clgt", "cmm",
    "cmn", "loz", "lozz", "con cho de"
  ],
  sexual: [
    "sex", "sexy", "sexting", "porn", "porno", "pornography", "pornographic", "nude", "nudes", "naked", "nudity", "nsfw",
    "xxx", "hentai", "blowjob", "blowjobs", "handjob", "orgasm", "orgasms", "masturbate", "masturbation", "dildo",
    "erotic", "erotica", "fetish", "boobs", "tits", "titties", "pussy", "horny", "milf", "onlyfans", "prostitute",
    "prostitutes", "prostitution", "hooker", "hookers", "stripper", "strippers", "brothel", "incest", "rape", "raped",
    "rapist", "raping", "molest", "molester", "pedophile", "pedophilia", "paedophile", "child porn", "anal", "cum",
    "dick pic", "sex toy", "one night stand",
    // Vietnamese
    "khieu dam", "tinh duc", "phim sex", "phim nguoi lon", "gai goi", "mai dam", "hiep dam", "au dam",
    "loan luan", "thu dam"
  ],
  hate: [
    "nazi", "nazis", "neo nazi", "heil hitler", "white power", "white supremacy", "white supremacist", "kkk",
    "ku klux klan", "ethnic cleansing", "gas the jews", "race war",
    // Vietnamese
    "diet chung"
  ],
  violence: [
    "kill", "kills", "killing", "killer", "killers", "murder", "murders", "murderer", "massacre", "behead",
    "beheading", "torture", "mass shooting", "school shooting", "shoot people", "terrorist", "terrorists",
    "terrorism", "bomb", "bombs", "bombing", "bomb making", "make a bomb", "gore", "genocide", "assassinate",
    "assassination", "stab", "stabbing", "lynch", "lynching",
    // Vietnamese
    "giet", "giet nguoi", "tham sat", "chem giet", "khung bo", "danh bom", "che tao bom", "dam chem"
  ],
  self_harm: [
    "suicide", "suicidal", "self harm", "selfharm", "kill myself", "cut myself", "hang myself", "end my life",
    // Vietnamese
    "rach tay", "muon chet"
  ],
  drugs: [
    "cocaine", "heroin", "meth", "methamphetamine", "crack cocaine", "marijuana", "cannabis", "lsd", "mdma", "ecstasy pills",
    "ketamine", "fentanyl", "opium", "drug dealer", "drug dealing", "sell drugs", "buy drugs",
    // Vietnamese
    "ma tuy", "thuoc phien", "can sa", "thuoc lac", "bay lac", "chich hut", "ma tuy da"
  ]
};

/** Vietnamese terms that are only matched with diacritics intact because the folded form is an ordinary word. */
const ACCENTED_TERMS: Partial<Record<SensitiveTextCategory, readonly string[]>> = {
  slur: ["mọi rợ", "khựa", "mọi đen", "thằng mọi", "con mọi", "đồ mọi", "ô môi", "ba que", "3 que", "thiểu năng", "đồ thiểu năng", "bê đê", "pê đê"],
  profanity: ["lồn", "địt", "cặc", "buồi", "đụ", "đéo", "đm", "đmm", "đcm", "đkm", "đĩ", "điếm", "đéo mẹ", "con đĩ", "chó chết", "con chó đẻ"],
  sexual: ["làm tình", "khỏa thân", "khoả thân"],
  hate: [],
  violence: ["tra tấn"],
  self_harm: ["tự tử", "tự vẫn", "tự hại", "tự sát", "treo cổ"],
  drugs: []
};

/** Unambiguous terms also matched as substrings inside a single normalised token. */
const STRONG_SUBSTRINGS: ReadonlyArray<readonly [string, SensitiveTextCategory]> = [
  ["nigger", "slur"], ["nigga", "slur"], ["faggot", "slur"], ["motherfuck", "profanity"], ["fuck", "profanity"],
  ["cocksuck", "profanity"], ["porn", "sexual"], ["hentai", "sexual"], ["pedophil", "sexual"], ["paedophil", "sexual"],
  ["khieudam", "sexual"], ["chingchong", "slur"]
];

/** Ordinary words that would otherwise trip a strong substring. */
const SAFE_TOKENS = new Set(["snigger", "sniggers", "sniggered", "sniggering"]);

/** Ordinary words with a doubled letter whose collapsed form equals a listed term ("less" → "les", "Conn" → "con"/"coon"). */
const SAFE_COLLAPSE_TOKENS = new Set(["conn", "conns", "annal", "annals", "gunn", "bett", "putt", "putts", "puttin", "hitt"]);

/** Group words that turn into a "people as a race / nationality / religion" topic when followed by PEOPLE_NOUNS. */
const RACE_GROUP_WORDS = [
  "white", "black", "brown", "yellow", "red skinned", "colored", "coloured", "asian", "african", "arab", "latino", "latina",
  "hispanic", "caucasian", "indian", "chinese", "japanese", "korean", "vietnamese", "filipino", "thai", "indonesian",
  "mexican", "russian", "american", "european", "middle eastern", "native", "indigenous", "gypsy", "roma", "mixed race",
  "biracial", "foreign born"
];
const RELIGION_GROUP_WORDS = ["muslim", "jewish", "christian", "catholic", "protestant", "hindu", "buddhist", "sikh", "atheist", "religious"];
const PEOPLE_NOUNS = [
  "people", "peoples", "person", "persons", "man", "men", "woman", "women", "guy", "guys", "folk", "folks", "girl", "girls",
  "boy", "boys", "kid", "kids", "children", "community", "communities", "population", "race", "races", "lives",
  "minority", "minorities"
];
const groupPhrases = (groups: readonly string[]) => groups.flatMap((group) => PEOPLE_NOUNS.map((noun) => `${group} ${noun}`));

/**
 * TOPIC-ONLY terms (mini-game topics + generated words; never names). Rationale: the mini-game builds a
 * 20-word English set for a workplace class, so a topic must be a workplace / everyday theme. Themes that
 * invite stereotypes, harassment or unsafe vocabulary are refused even when the learner's intent is
 * innocent. Deliberately LEFT ALLOWED (everyday / hospitality / workplace English):
 *  - colours with things: black coffee, white board, whiteboard, black tea, white wine, Black Friday, black belt;
 *  - nationality with things: Chinese food, Japanese culture, Korean BBQ, Asian cuisine, American English;
 *  - "race" alone (typing race, car race), "gender equality", "diversity", "immigration office", "foreigners";
 *  - beer, wine, cocktail, bar, pub, smoking area, pharmacy / drugstore, medicine;
 *  - Christmas, Tet, Easter, church, temple, pagoda (holidays & places, not religion as a group topic);
 *  - government office, vote, campaign (marketing), party (birthday), president / chairman (company roles);
 *  - fraud, scam, phishing, identity theft, harassment policy (workplace security / HR awareness);
 *  - funeral, hospital, insurance, lottery (everyday life), knife / scissors (kitchen & office tools),
 *    bullet points, photo shooting, deadline. ("kill time" stays blocked: "kill" is a general violence term.)
 *  - Ho Chi Minh City (the city; political-figure names list only foreign heads of state and dictators).
 */
const TOPIC_FOLDED_TERMS: Partial<Record<SensitiveTextCategory, readonly string[]>> = {
  identity: [
    "lesbian", "lesbians", "gay", "gays", "gay pride", "bisexual", "bisexuals", "bisexuality", "transgender", "transgenders",
    "transsexual", "transsexuals", "trans people", "trans person", "trans woman", "trans women", "trans man", "trans men",
    "queer", "queers", "lgbt", "lgbtq", "lgbtqia", "lgbti", "homosexual", "homosexuals", "homosexuality", "homo", "homos",
    "heterosexual", "heterosexuality", "pansexual", "asexual", "nonbinary", "non binary", "genderqueer", "intersex",
    "gender identity", "gender transition", "sexual orientation", "pride month", "drag queen", "drag queens", "ladyboy",
    "ladyboys", "same sex",
    // Vietnamese (unambiguous without diacritics)
    "nguoi dong tinh", "dong tinh nam", "dong tinh nu", "chuyen gioi", "nguoi chuyen gioi", "les gay", "nguoi les"
  ],
  race: [
    ...groupPhrases(RACE_GROUP_WORDS), "blacks", "the whites", "the blacks", "people of color", "people of colour",
    "racial", "racially", "racism", "racist", "racists", "race relations", "ethnic", "ethnicity", "ethnicities",
    "ethnic group", "ethnic minority", "skin color", "skin colour", "skin colors", "skin colours", "negroid", "caucasians",
    "afro american", "african american", "african americans", "white privilege", "black lives matter", "blm", "apartheid",
    "xenophobia", "anti semitism", "antisemitism",
    // Vietnamese
    "nguoi da den", "nguoi da trang", "nguoi da mau", "nguoi da vang", "chung toc", "sac toc", "dan toc",
    "dan toc thieu so", "phan biet chung toc", "phan biet sac toc"
  ],
  religion: [
    ...groupPhrases(RELIGION_GROUP_WORDS), "religion", "religions", "religious", "muslim", "muslims", "islam", "islamic",
    "islamist", "jew", "jews", "judaism", "christians", "christianity", "catholics", "catholicism", "protestants",
    "hinduism", "hindus", "buddhism", "buddhists", "sikhs", "atheism", "atheists", "jihad", "jihadist", "jihadists",
    "isis", "isil", "al qaeda", "alqaeda", "taliban", "hamas", "hezbollah", "boko haram", "terror group",
    "terrorist group", "extremist", "extremists", "extremism", "radicalization", "radicalisation", "caliphate",
    "holy war",
    // Vietnamese
    "ton giao", "dao hoi", "hoi giao", "thien chua giao", "cong giao", "phat giao", "thanh chien", "cuc doan",
    "khung bo hoi giao"
  ],
  politics: [
    "politics", "political", "politically", "politician", "politicians", "election", "elections", "electoral",
    "presidential election", "communist", "communists", "communism", "socialism", "socialist", "capitalism", "fascism",
    "fascist", "fascists", "democrat", "democrats", "republican", "republicans", "democracy", "dictator", "dictators",
    "dictatorship", "propaganda", "coup", "coup d etat", "revolutionaries", "political party", "communist party",
    "protest", "protests", "protester", "protesters", "riot", "riots", "independence movement", "separatist",
    "hitler", "adolf hitler", "stalin", "lenin", "mao zedong", "mao tse tung", "mussolini", "pol pot", "bin laden",
    "osama", "saddam", "gaddafi", "putin", "trump", "donald trump", "biden", "joe biden", "obama", "kim jong un",
    "kim jong il", "xi jinping", "zelensky", "zelenskyy", "netanyahu", "khamenei", "erdogan", "maduro",
    // Vietnamese
    "chinh tri", "chinh tri gia", "dang cong san", "chu nghia cong san", "tap can binh"
  ],
  sexual: [
    "sexual", "sexually", "sexuality", "sexualities", "sexier", "sexiest", "condom", "condoms", "lingerie", "seduce",
    "seduction", "intercourse", "foreplay", "bdsm", "kinky", "strip club", "strip clubs", "adult film", "adult films",
    "adult content", "adult video", "adult videos", "playboy", "penis", "penises", "vagina", "vaginas", "genital",
    "genitals", "testicle", "testicles", "ejaculation", "making love", "sexual harassment",
    "escort service", "sugar daddy", "one night stands",
    // Vietnamese
    "bao cao su", "quan he tinh duc", "duong vat"
  ],
  weapons: [
    "gun", "guns", "handgun", "handguns", "pistol", "pistols", "rifle", "rifles", "assault rifle", "shotgun", "shotguns",
    "firearm", "firearms", "weapon", "weapons", "weaponry", "ammo", "ammunition", "grenade", "grenades", "explosive",
    "explosives", "sniper", "snipers", "machine gun", "machine guns", "ak47", "ak 47", "ar15", "ar 15", "missile",
    "missiles", "nuclear weapon", "nuclear weapons", "nuke", "nukes", "landmine", "landmines", "gunfire", "shootout",
    "warfare", "war crimes", "world war", "assassin", "assassins",
    // Vietnamese
    "vu khi", "sung truong", "sung luc", "luu dan", "thuoc no", "ten lua", "bom nguyen tu", "dao gam"
  ],
  gambling: [
    "gamble", "gambles", "gambling", "gambler", "gamblers", "casino", "casinos", "betting", "sports betting", "bookmaker",
    "bookie", "bookies", "sportsbook", "poker", "roulette", "blackjack", "baccarat", "slot machine", "slot machines",
    // Vietnamese
    "ca do bong da"
  ],
  drugs: [
    "drugs", "illegal drugs", "drug addiction", "drug addict", "drug addicts", "drug abuse", "drug use", "narcotic",
    "narcotics", "overdose", "weed smoking", "smoking weed", "smoke weed", "getting high", "get high", "stoner", "stoned",
    "drunk", "drunken", "getting drunk", "get drunk", "drunk driving", "alcoholism", "alcoholics",
    "binge drinking", "vape", "vaping",
    // Vietnamese
    "say ruou", "nghien ruou", "nghien ma tuy", "chat cam", "chat kich thich"
  ],
  crime: [
    "crime", "crimes", "criminal", "criminals", "robbery", "robberies", "robber", "robbers", "burglary", "burglar",
    "burglars", "kidnap", "kidnapping", "kidnapper", "hostage", "hostages", "human trafficking", "trafficking",
    "smuggling", "smuggler", "smugglers", "mafia", "gangster", "gangsters", "gang violence", "hitman", "hitmen",
    "serial killer", "mugging", "arson", "shoplifting", "money laundering", "hacking into",
    // Vietnamese
    "toi pham", "cuop", "cuop giat", "buon lau", "xa hoi den", "rua tien"
  ],
  violence: [
    "violence", "violent", "abuse", "domestic violence", "fight club", "bloodshed", "bloody",
    "corpse", "corpses", "dead body", "dead bodies", "dead people", "death", "deaths", "death penalty", "dying",
    "autopsy", "euthanasia", "homicide",
    // Vietnamese
    "bao luc", "chien tranh", "xac chet", "tu vong", "tu hinh"
  ],
  self_harm: ["self injury", "self injure", "how to die", "want to die", "cutting myself", "anorexia", "bulimia"]
};

/** TOPIC-ONLY Vietnamese terms that need their diacritics (the folded form is an ordinary word). */
const TOPIC_ACCENTED_TERMS: Partial<Record<SensitiveTextCategory, readonly string[]>> = {
  identity: ["đồng tính", "song tính", "lưỡng tính", "bóng lộ", "bóng kín", "ái nam ái nữ", "lét"],
  race: ["kỳ thị", "kỳ thị chủng tộc"],
  religion: ["do thái", "đạo tin lành", "đạo phật", "đạo chúa"],
  politics: ["cộng sản", "tổng thống", "tàu cộng", "việt cộng", "bầu cử", "biểu tình", "phản động", "độc tài", "đảo chính"],
  weapons: ["súng", "đạn", "mã tấu"],
  gambling: ["cá độ", "cờ bạc", "đánh bạc", "sòng bạc", "nhà cái", "bài bạc", "cá cược", "lô đề", "đánh đề"],
  crime: ["bắt cóc", "buôn người", "trộm cướp", "ăn cướp", "giang hồ"],
  violence: ["cái chết", "chém nhau", "đánh nhau"],
  sexual: ["gợi cảm", "âm đạo", "đồ lót"]
};

/** TOPIC-ONLY substrings for squashed forms ("whitepeoplefacts", "lgbtqplus", "casinonight"). */
const TOPIC_STRONG_SUBSTRINGS: ReadonlyArray<readonly [string, SensitiveTextCategory]> = [
  ["lesbian", "identity"], ["bisexual", "identity"], ["transgender", "identity"], ["homosexual", "identity"],
  ["lgbt", "identity"], ["whitepeople", "race"], ["blackpeople", "race"], ["asianpeople", "race"], ["racism", "race"],
  ["hitler", "politics"], ["jihad", "religion"], ["casino", "gambling"], ["gambl", "gambling"], ["sexual", "sexual"],
  ["firearm", "weapons"], ["handgun", "weapons"], ["shotgun", "weapons"]
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "|": "i", "€": "e" };

interface CompiledTerms { single: Map<string, string>; phrases: Array<{ tokens: string[]; term: string }>; categories: Map<string, SensitiveTextCategory> }

function compile(source: Partial<Record<SensitiveTextCategory, readonly string[]>>, normalize: (value: string) => string[]): CompiledTerms {
  const compiled: CompiledTerms = { single: new Map(), phrases: [], categories: new Map() };
  for (const [category, terms] of Object.entries(source) as Array<[SensitiveTextCategory, readonly string[]]>) {
    for (const term of terms) {
      const tokens = normalize(term);
      if (!tokens.length) continue;
      compiled.categories.set(term, category);
      if (tokens.length === 1) compiled.single.set(tokens[0]!, term);
      else {
        compiled.phrases.push({ tokens, term });
        compiled.single.set(tokens.join(""), term);
      }
    }
  }
  return compiled;
}

function foldDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/**
 * Accented Vietnamese words whose folded form is a listed English word ("gây"/"gãy" → "gay",
 * "cụm" → "cum", "trạng thái màn" → "thai man", "để" → "de"). They are dropped before folding; the
 * diacritic-aware pass still sees them, so "bê đê" / "con chó đẻ" are listed there too.
 */
const COLLIDING_FOLDS = new Set(["gay", "gays", "cum", "cums", "thai", "man", "men", "de"]);

function dropCollidingAccentedWords(text: string): string {
  return text.normalize("NFC").replace(/[\p{L}\p{M}]+/gu, (word) =>
    /[^\p{ASCII}]/u.test(word) && COLLIDING_FOLDS.has(foldDiacritics(word).toLowerCase()) ? " " : word);
}

/** Lower-cased, diacritic-folded, leetspeak-mapped tokens with spaced-out letters re-joined. */
function foldedTokens(text: string): string[] {
  const lowered = foldDiacritics(dropCollidingAccentedWords(text.normalize("NFKC"))).toLowerCase();
  const chunks = lowered.split(/[^a-z0-9@$!|€*]+/u).filter(Boolean);
  const tokens: string[] = [];
  for (const chunk of chunks) {
    // Map leetspeak only inside chunks that also contain real letters ("sh1t", "@ss"), so "2024" stays a number.
    // A number with a unit ("45s", "10km") is not leetspeak.
    const hasLetters = /[a-z]/.test(chunk) && !/^\d{2,}[a-z]+$/u.test(chunk);
    const mapped = hasLetters
      ? chunk.replace(/[!|]+$/u, "").replace(/[0-9@$!|€]/gu, (char) => LEET[char] ?? char)
      : chunk.replace(/[^0-9a-z]/gu, "");
    for (const piece of mapped.split(/[^a-z0-9*]+/u)) if (piece) tokens.push(piece);
  }
  return joinSpacedLetters(tokens);
}

function accentedTokens(text: string): string[] {
  return text.normalize("NFKC").normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** "f u c k" / "s.e.x" → one token; runs of two or more single letters are merged. */
function joinSpacedLetters(tokens: string[]): string[] {
  const output: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) output.push(run.join(""));
    else output.push(...run);
    run = [];
  };
  for (const token of tokens) {
    if (token.length === 1 && /[a-z*]/.test(token)) run.push(token);
    else { flush(); output.push(token); }
  }
  flush();
  return output;
}

/** Token variants: as typed, letter runs of 3+ squeezed to one ("fuuuck") and to two ("asss"). */
function variants(token: string): string[] {
  const one = token.replace(/(.)\1{2,}/gu, "$1");
  const two = token.replace(/(.)\1{2,}/gu, "$1$1");
  const out = new Set([token, one, two]);
  for (const value of [...out]) if (value.length > 3 && value.endsWith("s")) out.add(value.slice(0, -1));
  return [...out];
}

/** Every letter run of two or more collapsed to one letter ("nazii" → "nazi", "people" → "peple"). */
function collapseRuns(value: string): string {
  return value.replace(/(.)\1+/gu, "$1");
}

const hasRun = (value: string) => /(.)\1/u.test(value);

/**
 * Same terms with every token run-collapsed, for the doubled-letter pass. Terms with a collapsed token
 * shorter than three letters are left out ("ass" → "as", "kkk" → "k", "be de") so short everyday words
 * cannot collide.
 */
function compileCollapsed(source: Partial<Record<SensitiveTextCategory, readonly string[]>>): CompiledTerms {
  const compiled: CompiledTerms = { single: new Map(), phrases: [], categories: new Map() };
  for (const [category, terms] of Object.entries(source) as Array<[SensitiveTextCategory, readonly string[]]>) {
    for (const term of terms) {
      const tokens = foldedTokens(term).map(collapseRuns);
      if (!tokens.length || tokens.some((token) => token.length < 3)) continue;
      compiled.categories.set(term, category);
      if (tokens.length === 1) compiled.single.set(tokens[0]!, term);
      else {
        compiled.phrases.push({ tokens, term });
        compiled.single.set(collapseRuns(tokens.join("")), term);
      }
    }
  }
  return compiled;
}

interface TermSet {
  folded: CompiledTerms;
  collapsed: CompiledTerms;
  accented: CompiledTerms;
  strong: ReadonlyArray<readonly [string, SensitiveTextCategory]>;
}

function termSet(
  folded: Partial<Record<SensitiveTextCategory, readonly string[]>>,
  accented: Partial<Record<SensitiveTextCategory, readonly string[]>>,
  strong: ReadonlyArray<readonly [string, SensitiveTextCategory]>
): TermSet {
  return {
    folded: compile(folded, (term) => foldedTokens(term)),
    collapsed: compileCollapsed(folded),
    accented: compile(accented, (term) => accentedTokens(term)),
    strong
  };
}

const GENERAL = termSet(FOLDED_TERMS, ACCENTED_TERMS, STRONG_SUBSTRINGS);
const TOPIC = termSet(TOPIC_FOLDED_TERMS, TOPIC_ACCENTED_TERMS, TOPIC_STRONG_SUBSTRINGS);

function matchWildcard(token: string, single: Map<string, string>): string | undefined {
  // "f*ck", "sh*t": a masked token matches a listed term of the same length when at least two real letters line up.
  if (!token.includes("*") || token.replace(/\*/g, "").length < 2) return undefined;
  const pattern = new RegExp(`^${token.replace(/\*/g, "[a-z]")}$`, "u");
  for (const [key, term] of single) if (key.length === token.length && pattern.test(key)) return term;
  return undefined;
}

/**
 * `tokenVariants[i]` lists the forms token i may take. When `required` is given (doubled-letter pass),
 * a hit only counts if at least one token of the matched span really had a repeated letter.
 */
function matchVariants(tokenVariants: string[][], compiled: CompiledTerms, wildcard: boolean, required?: boolean[]): string | undefined {
  const spanOk = (start: number, length: number) => !required || required.slice(start, start + length).some(Boolean);
  // Phrases first: they are more specific ("kill myself" is self-harm, not just violence).
  for (const phrase of compiled.phrases) {
    for (let start = 0; start + phrase.tokens.length <= tokenVariants.length; start += 1) {
      if (spanOk(start, phrase.tokens.length) && phrase.tokens.every((part, offset) => tokenVariants[start + offset]!.includes(part))) return phrase.term;
    }
  }
  for (let index = 0; index < tokenVariants.length; index += 1) {
    if (!spanOk(index, 1)) continue;
    for (const value of tokenVariants[index]!) {
      const hit = compiled.single.get(value) ?? (wildcard ? matchWildcard(value, compiled.single) : undefined);
      if (hit) return hit;
    }
  }
  return undefined;
}

function issueFrom(compiled: CompiledTerms, term: string | undefined): SensitiveTextIssue | null {
  return term ? { category: compiled.categories.get(term)!, term } : null;
}

function scan(text: string, set: TermSet): SensitiveTextIssue | null {
  const accented = issueFrom(set.accented, matchVariants(accentedTokens(text).map((token) => [token]), set.accented, false));
  if (accented) return accented;
  const tokens = foldedTokens(text);
  const tokenVariants = tokens.map(variants);
  const folded = issueFrom(set.folded, matchVariants(tokenVariants, set.folded, true));
  if (folded) return folded;
  // Doubled-letter evasion ("nazii", "blackk peoplee"): only tokens that really contain a repeat.
  const repeated = tokens.map((token) => hasRun(token) && !SAFE_COLLAPSE_TOKENS.has(token));
  if (repeated.some(Boolean)) {
    const collapsedVariants = tokenVariants.map((forms) => [...new Set(forms.map(collapseRuns))]);
    const collapsed = issueFrom(set.collapsed, matchVariants(collapsedVariants, set.collapsed, false, repeated));
    if (collapsed) return collapsed;
  }
  for (const [index, token] of tokens.entries()) {
    if (SAFE_TOKENS.has(token)) continue;
    const forms = repeated[index] ? [...tokenVariants[index]!, ...tokenVariants[index]!.map(collapseRuns)] : tokenVariants[index]!;
    for (const value of forms) {
      for (const [needle, category] of set.strong) {
        if (value.includes(needle) || (repeated[index] && value.includes(collapseRuns(needle)))) return { category, term: needle };
      }
    }
  }
  return null;
}

/**
 * Returns the first sensitive category found in `text`, or null when the text looks safe.
 * Use for people's names and profile fields — not for grading learner answers. Mini-game topics and
 * generated words use the stricter `sensitiveTopicIssue`.
 */
export function sensitiveTextIssue(text: string | null | undefined): SensitiveTextIssue | null {
  if (!text || !text.trim()) return null;
  return scan(text, GENERAL);
}

/**
 * `sensitiveTextIssue` plus the topic-only themes (identity, race, religion, politics, weapons,
 * gambling, crime and wider sexual / drug / violence / death words). Use for mini-game topics and
 * every AI-generated word of a word set.
 */
export function sensitiveTopicIssue(text: string | null | undefined): SensitiveTextIssue | null {
  if (!text || !text.trim()) return null;
  return scan(text, GENERAL) ?? scan(text, TOPIC);
}

/**
 * How serious a sensitive mini-game topic is:
 *  - "abusive": slurs, profanity, explicit sexual content, hate, violence, self-harm, drugs — the
 *    general `sensitiveTextIssue` categories, which count as a safety strike immediately;
 *  - "unsuitable": only a topic-only theme (identity, race, religion, politics, weapons, gambling,
 *    crime, death, wider drug / sexual words) — refused gently, without a strike.
 */
export type SensitiveTopicSeverity = "abusive" | "unsuitable";

export function sensitiveTopicSeverity(text: string | null | undefined): (SensitiveTextIssue & { severity: SensitiveTopicSeverity }) | null {
  if (!text || !text.trim()) return null;
  const general = scan(text, GENERAL);
  if (general) return { ...general, severity: "abusive" };
  const topic = scan(text, TOPIC);
  return topic ? { ...topic, severity: "unsuitable" } : null;
}

/** True when any of the given strings is sensitive (convenience for filtering generated items). */
export function hasSensitiveText(...values: ReadonlyArray<string | null | undefined>): boolean {
  return values.some((value) => sensitiveTextIssue(value) !== null);
}

/** True when any of the given strings is an unsuitable mini-game topic or generated word. */
export function hasSensitiveTopicText(...values: ReadonlyArray<string | null | undefined>): boolean {
  return values.some((value) => sensitiveTopicIssue(value) !== null);
}
