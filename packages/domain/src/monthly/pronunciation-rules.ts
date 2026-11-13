/**
 * Rule explanations for the B1–C1 pronunciation roadmap items (product rules
 * document, 13/11/2026). Static teaching copy keyed by catalog item ID: the
 * lesson shows the rule, a memory hint and the typical mistake of Vietnamese
 * learners in the lesson language, resolved at render time from the item the
 * lesson teaches, so published lessons need no regeneration. `caution` is
 * generation/QA guidance for the AI only (tendencies, not absolute rules) and
 * is never shown to learners. A1–A2 phoneme and pair items have no entry.
 */

import type { CefrLevel } from "@e4s/contracts";
import { findMonthlyPronunciationCatalogItem, monthlyPronunciationCatalogKey } from "./pronunciation-catalog.js";

export interface MonthlyPronunciationRuleCore {
  /** Which written ending the example words carry. */
  ending: "s" | "ed";
  patternEn: string;
  patternVi: string;
  /** The sound the ending takes, in slashes (e.g. "/t/"). */
  result: string;
}

export interface MonthlyPronunciationRule {
  ruleVi: string;
  ruleEn: string;
  rememberVi: string;
  rememberEn: string;
  mistakeVi: string;
  mistakeEn: string;
  /**
   * The rule core shown as a small formula ("voiceless sound … + -ed → /t/"), only for the
   * -s/-es and -ed ending items whose example words show the ending deterministically.
   */
  core?: MonthlyPronunciationRuleCore;
  /** Prompt-only generation/QA caution (English). */
  caution?: string;
}

// Split topics (-s/-es into /s/ /z/ /ɪz/, -ed into /t/ /d/ /ɪd/): each day's item explains ONLY its own
// sub-case — no shared rule listing every case and no "This item: …" tail (product decision 13/11).
const ENDING_CAUTION = "Decide the ending from the LAST SOUND of the base word, not its spelling (laugh ends in /f/ → laughed /lɑːft/; fix ends in /s/ → fixes /ˈfɪksɪz/). Every example must show the target ending only.";
const CLUSTER_CAUTION = "Transcribe the cluster with no vowel between its consonants; use common workplace words; do not invent rare words to fit the cluster.";
const STRESS_CAUTION = "Stress rules are strong tendencies with exceptions: choose words that follow the pattern in standard British dictionaries and avoid words whose stress differs between British and American English unless both are accepted.";
const PROSODY_CAUTION = "Prosody is a tendency, not a fixed rule: do not present one tone or one accent as the only correct one; mark only what a natural speaker would really do in this context.";

export const MONTHLY_PRONUNCIATION_RULES: Readonly<Record<string, MonthlyPronunciationRule>> = {
  // ---------------------------------------------------------------- B1
  "b1-s-s": {
    ruleVi: "Đuôi -s đọc /s/ sau âm vô thanh /p t k f θ/; không thêm âm tiết (report → reports).",
    ruleEn: "-s is /s/ after the voiceless sounds /p t k f θ/; it adds no syllable (report → reports).",
    rememberVi: "Đặt tay lên cổ họng: âm cuối không rung (p, t, k, f) thì -s cũng không rung → /s/.",
    rememberEn: "Hand on your throat: if the last sound does not buzz (p, t, k, f), the -s does not buzz either → /s/.",
    mistakeVi: "Bỏ hẳn đuôi -s (\"two report\") hoặc đọc thành \"xờ\" kéo dài thêm âm tiết.",
    mistakeEn: "Dropping the -s (\"two report\") or adding an extra \"sờ\" syllable.",
    core: { ending: "s", patternEn: "voiceless sound /p t k f θ/ + -s", patternVi: "âm vô thanh /p t k f θ/ + -s", result: "/s/" },
    caution: ENDING_CAUTION
  },
  "b1-s-z": {
    ruleVi: "Đuôi -s đọc /z/ sau nguyên âm và âm hữu thanh (/b d g v l m n/…); không thêm âm tiết (plan → plans).",
    ruleEn: "-s is /z/ after vowels and voiced sounds (/b d g v l m n/…); it adds no syllable (plan → plans).",
    rememberVi: "Âm cuối rung (nguyên âm, l, n, m, d, g, v…) thì -s cũng rung → /z/.",
    rememberEn: "If the last sound buzzes (a vowel, l, n, m, d, g, v…), the -s buzzes too → /z/.",
    mistakeVi: "Đọc mọi đuôi -s thành /s/ (plans → /plæns/) hoặc bỏ mất đuôi.",
    mistakeEn: "Reading every -s as /s/ (plans → /plæns/) or dropping it.",
    core: { ending: "s", patternEn: "vowel or voiced sound + -s", patternVi: "nguyên âm hoặc âm hữu thanh + -s", result: "/z/" },
    caution: ENDING_CAUTION
  },
  "b1-s-iz": {
    ruleVi: "Đuôi -s/-es đọc /ɪz/ sau âm xuýt /s z ʃ ʒ tʃ dʒ/; thêm một âm tiết (office → offices).",
    ruleEn: "-s/-es is /ɪz/ after the hissing sounds /s z ʃ ʒ tʃ dʒ/; it adds a syllable (office → offices).",
    rememberVi: "Từ đã kết thúc bằng âm \"xì\" (s, z, sh, ch, j) thì phải thêm một âm tiết /ɪz/ mới nghe được đuôi.",
    rememberEn: "When the word already ends in a hissing sound (s, z, sh, ch, j), add a whole syllable /ɪz/.",
    mistakeVi: "Không thêm âm tiết (offices đọc như office) hoặc thêm /ɪz/ cả sau từ không có âm xuýt (works → /wɜːkɪz/).",
    mistakeEn: "Not adding the syllable (offices sounds like office) or adding /ɪz/ where there is no hissing sound (works → /wɜːkɪz/).",
    core: { ending: "s", patternEn: "hissing sound /s z ʃ ʒ tʃ dʒ/ + -es", patternVi: "âm xuýt /s z ʃ ʒ tʃ dʒ/ + -es", result: "/ɪz/" },
    caution: `${ENDING_CAUTION} An /ɪz/ example must end in /s z ʃ ʒ tʃ dʒ/ before the ending.`
  },
  "b1-s-contraction": {
    ruleVi: "'s rút gọn của is/has theo cùng luật đuôi -s: /s/ sau âm vô thanh (it's, that's), /z/ sau nguyên âm và âm hữu thanh (he's, she's). Không thêm âm tiết.",
    ruleEn: "Contracted 's (is/has) follows the -s rule: /s/ after voiceless sounds (it's, that's), /z/ after vowels and voiced sounds (he's, she's). It adds no syllable.",
    rememberVi: "'s dính liền vào từ trước như một phụ âm cuối, không tách ra.",
    rememberEn: "The 's sticks to the word before it as a final consonant; it is not a separate word.",
    mistakeVi: "Bỏ mất 's (\"it ready\") hoặc đọc đầy đủ \"it is\" khiến câu cứng.",
    mistakeEn: "Dropping the 's (\"it ready\") or always saying the full \"it is\", which sounds stiff.",
    caution: "Contractions are normal in speech but not obligatory; do not mark every is/has as contracted."
  },
  "b1-ed-t": {
    ruleVi: "Đuôi -ed đọc /t/ sau âm vô thanh /p k f s ʃ tʃ θ/; không thêm âm tiết (help → helped).",
    ruleEn: "-ed is /t/ after the voiceless sounds /p k f s ʃ tʃ θ/; it adds no syllable (help → helped).",
    rememberVi: "Âm cuối không rung (p, k, f, s, sh, ch) → -ed cũng không rung → /t/, không thêm âm tiết.",
    rememberEn: "If the last sound does not buzz (p, k, f, s, sh, ch), -ed does not buzz → /t/, with no extra syllable.",
    mistakeVi: "Đọc mọi -ed thành /ɪd/ (helped → \"hel-pid\") hoặc nuốt mất /t/ cuối.",
    mistakeEn: "Reading every -ed as /ɪd/ (helped → \"hel-pid\") or dropping the final /t/.",
    core: { ending: "ed", patternEn: "voiceless sound /p k f s ʃ tʃ θ/ + -ed", patternVi: "âm vô thanh /p k f s ʃ tʃ θ/ + -ed", result: "/t/" },
    caution: `${ENDING_CAUTION} Never use a verb whose base ends in /t/ or /d/ (wanted, needed) for the /t/ item.`
  },
  "b1-ed-d": {
    ruleVi: "Đuôi -ed đọc /d/ sau nguyên âm và âm hữu thanh (/b g v z l m n/…); không thêm âm tiết (call → called).",
    ruleEn: "-ed is /d/ after vowels and voiced sounds (/b g v z l m n/…); it adds no syllable (call → called).",
    rememberVi: "Âm cuối rung (nguyên âm, l, n, m, b, g, v, z) → -ed rung → /d/, không thêm âm tiết.",
    rememberEn: "If the last sound buzzes (a vowel, l, n, m, b, g, v, z), -ed buzzes → /d/, with no extra syllable.",
    mistakeVi: "Thêm âm tiết (planned → \"plan-nid\") hoặc đọc thành /t/ mạnh.",
    mistakeEn: "Adding a syllable (planned → \"plan-nid\") or saying a strong /t/.",
    core: { ending: "ed", patternEn: "vowel or voiced sound + -ed", patternVi: "nguyên âm hoặc âm hữu thanh + -ed", result: "/d/" },
    caution: `${ENDING_CAUTION} Never use a verb whose base ends in /t/ or /d/ for the /d/ item.`
  },
  "b1-ed-id": {
    ruleVi: "Đuôi -ed đọc /ɪd/ sau /t/ hoặc /d/; thêm một âm tiết (start → started).",
    ruleEn: "-ed is /ɪd/ after /t/ or /d/; it adds a syllable (start → started).",
    rememberVi: "Chỉ khi từ gốc tận cùng bằng âm /t/ hoặc /d/ mới thêm âm tiết /ɪd/.",
    rememberEn: "Only a base word ending in the sound /t/ or /d/ gets the extra syllable /ɪd/.",
    mistakeVi: "Dùng /ɪd/ cho mọi động từ (worked → \"wơ-kid\").",
    mistakeEn: "Using /ɪd/ for every verb (worked → \"wer-kid\").",
    core: { ending: "ed", patternEn: "/t/ or /d/ + -ed", patternVi: "/t/ hoặc /d/ + -ed", result: "/ɪd/" },
    caution: `${ENDING_CAUTION} An /ɪd/ example must have /t/ or /d/ before the ending.`
  },
  "b1-ed-link": {
    ruleVi: "Khi từ có -ed đứng trước từ bắt đầu bằng nguyên âm, âm /t/ hoặc /d/ cuối nối sang nguyên âm đó: checked it /tʃekt‿ɪt/, called us /kɔːld‿ʌs/.",
    ruleEn: "When an -ed word comes before a word starting with a vowel, its final /t/ or /d/ joins that vowel: checked it /tʃekt‿ɪt/, called us /kɔːld‿ʌs/.",
    rememberVi: "Đọc như thể /t/ hoặc /d/ là âm đầu của từ sau: \"check-tit\".",
    rememberEn: "Say the /t/ or /d/ as if it starts the next word: \"check-tit\".",
    mistakeVi: "Ngắt hơi giữa hai từ và nuốt mất đuôi -ed.",
    mistakeEn: "Pausing between the words and losing the -ed.",
    caution: "Link only where a vowel really follows; do not add ‿ to every word boundary."
  },
  "b1-onset-pl-pr": {
    ruleVi: "/pl/, /pr/ là cụm hai phụ âm đọc liền trong một âm tiết, không có nguyên âm chen giữa: plan /plæn/, price /praɪs/.",
    ruleEn: "/pl/ and /pr/ are two consonants said together in one syllable, with no vowel between them: plan /plæn/, price /praɪs/.",
    rememberVi: "Môi đặt sẵn cho /p/, lưỡi chuẩn bị /l/ hoặc /r/ rồi bật ra một lần.",
    rememberEn: "Lips ready for /p/, tongue already in place for /l/ or /r/, then release once.",
    mistakeVi: "Chèn nguyên âm vào giữa cụm: plan → \"pờ-lan\", price → \"pờ-rai\".",
    mistakeEn: "Putting a vowel inside the cluster: plan → \"puh-lan\", price → \"puh-rice\".",
    caution: CLUSTER_CAUTION
  },
  "b1-onset-kl-kr": {
    ruleVi: "/kl/, /kr/ đọc liền trong một âm tiết, không chen nguyên âm: client /ˈklaɪənt/, create /kriˈeɪt/.",
    ruleEn: "/kl/ and /kr/ are said together in one syllable, with no vowel between: client /ˈklaɪənt/, create /kriˈeɪt/.",
    rememberVi: "Cuống lưỡi chặn /k/ trong khi đầu lưỡi đã ở vị trí /l/ hoặc /r/.",
    rememberEn: "The back of the tongue makes /k/ while the tip is already in place for /l/ or /r/.",
    mistakeVi: "Chèn nguyên âm: client → \"cờ-lai-ần\", hoặc bỏ /l/, /r/.",
    mistakeEn: "Adding a vowel: client → \"kuh-lai-ent\", or dropping the /l/ or /r/.",
    caution: CLUSTER_CAUTION
  },
  "b1-onset-st-sp": {
    ruleVi: "/st/, /sp/ đầu từ: /s/ kéo nhẹ rồi nối ngay /t/ hoặc /p/, không nguyên âm phía trước hay ở giữa: staff /stɑːf/, speak /spiːk/.",
    ruleEn: "Initial /st/ and /sp/: a short /s/ straight into /t/ or /p/, with no vowel before or between: staff /stɑːf/, speak /spiːk/.",
    rememberVi: "Bắt đầu bằng tiếng \"xì\" rồi bật ngay âm sau.",
    rememberEn: "Start with a hiss and go straight into the next sound.",
    mistakeVi: "Thêm âm \"ơ\": staff → \"xơ-taf\", speak → \"xơ-pích\".",
    mistakeEn: "Adding a vowel: staff → \"suh-taff\", speak → \"suh-peak\".",
    caution: CLUSTER_CAUTION
  },
  "b1-onset-str-spl": {
    ruleVi: "Cụm ba phụ âm /str/, /spl/ (cả /spr/, /skr/) đọc liền thành một nhịp: strategy /ˈstrætədʒi/, split /splɪt/.",
    ruleEn: "Three-consonant clusters /str/, /spl/ (also /spr/, /skr/) are said in one beat: strategy /ˈstrætədʒi/, split /splɪt/.",
    rememberVi: "Ghép dần: s → st → str, rồi đọc cả cụm một lần.",
    rememberEn: "Build it up: s → st → str, then say the whole cluster at once.",
    mistakeVi: "Tách thành nhiều âm tiết: street → \"xơ-tơ-rít\".",
    mistakeEn: "Splitting it into syllables: street → \"suh-tuh-reet\".",
    caution: CLUSTER_CAUTION
  },
  "b1-coda-nt-nd": {
    ruleVi: "Cụm cuối /nt/, /nd/: giữ /n/ rồi chặn bằng /t/ hoặc /d/; cả hai phụ âm đều phải nghe được: client, spend.",
    ruleEn: "Final /nt/ and /nd/: hold the /n/, then close with /t/ or /d/; both consonants must be heard: client, spend.",
    rememberVi: "Đầu lưỡi đặt ở chân răng trên cho /n/ và giữ nguyên chỗ đó để bật /t/, /d/.",
    rememberEn: "The tongue tip stays behind the top teeth for /n/ and releases from the same place for /t/ or /d/.",
    mistakeVi: "Bỏ âm cuối: client → \"clai-ần\", spend → \"spen\".",
    mistakeEn: "Dropping the last sound: client → \"clie-n\", spend → \"spen\".",
    caution: CLUSTER_CAUTION
  },
  "b1-coda-ks": {
    ruleVi: "Cụm cuối /ks/ (thường viết x, ks, cks): /k/ chặn ngắn rồi xì /s/: fix /fɪks/, tasks /tɑːsks/.",
    ruleEn: "Final /ks/ (often spelt x, ks, cks): a short /k/, then a hissed /s/: fix /fɪks/, tasks /tɑːsks/.",
    rememberVi: "Chữ x cuối từ = /k/ + /s/.",
    rememberEn: "A final x = /k/ + /s/.",
    mistakeVi: "Chỉ đọc /k/ hoặc chỉ /s/: fix → \"phích\".",
    mistakeEn: "Saying only /k/ or only /s/: fix → \"fik\".",
    caution: CLUSTER_CAUTION
  },
  "b1-coda-st": {
    ruleVi: "Cụm cuối /st/: xì /s/ rồi chặn /t/, không bỏ /t/: list /lɪst/, cost /kɒst/.",
    ruleEn: "Final /st/: hiss the /s/, then close with /t/; do not drop the /t/: list /lɪst/, cost /kɒst/.",
    rememberVi: "Kết thúc bằng tiếng \"t\" nhẹ sau \"xì\".",
    rememberEn: "Finish with a light \"t\" after the hiss.",
    mistakeVi: "Bỏ /t/ cuối: cost → \"cót-s\"/\"cos\", list → \"lít\".",
    mistakeEn: "Dropping the final /t/: cost → \"coss\", list → \"liss\".",
    caution: `${CLUSTER_CAUTION} In fast speech /t/ may drop before a consonant (B2 elision); in single-word examples always keep it.`
  },
  "b1-coda-lt-ld": {
    ruleVi: "Cụm cuối /lt/, /ld/: đầu lưỡi chạm chân răng cho /l/ rồi bật /t/ hoặc /d/: result /rɪˈzʌlt/, build /bɪld/.",
    ruleEn: "Final /lt/ and /ld/: tongue tip up for /l/, then release /t/ or /d/: result /rɪˈzʌlt/, build /bɪld/.",
    rememberVi: "Đừng biến /l/ thành \"u\": lưỡi phải chạm lên.",
    rememberEn: "Do not turn the /l/ into \"oo\": the tongue must touch.",
    mistakeVi: "Bỏ /l/ hoặc bỏ âm cuối: build → \"biu\", result → \"ri-dắt\".",
    mistakeEn: "Dropping the /l/ or the last sound: build → \"biu\", result → \"ri-zut\".",
    caution: `${CLUSTER_CAUTION} Silent l (should, could, walk) does not count.`
  },
  "b1-stress-noun-adj": {
    ruleVi: "Phần lớn danh từ và tính từ hai âm tiết nhấn âm tiết ĐẦU: office /ˈɒfɪs/, budget /ˈbʌdʒɪt/, busy /ˈbɪzi/.",
    ruleEn: "Most two-syllable nouns and adjectives are stressed on the FIRST syllable: office /ˈɒfɪs/, budget /ˈbʌdʒɪt/, busy /ˈbɪzi/.",
    rememberVi: "Danh từ, tính từ \"đi trước\": NHẤN trước.",
    rememberEn: "Nouns and adjectives lead: stress comes first.",
    mistakeVi: "Đọc hai âm tiết bằng nhau như tiếng Việt, không có âm tiết mạnh.",
    mistakeEn: "Giving both syllables equal weight, as in Vietnamese.",
    caution: `${STRESS_CAUTION} Avoid exceptions such as hotel, police, mistake unless the item contrasts them.`
  },
  "b1-stress-verb": {
    ruleVi: "Phần lớn động từ hai âm tiết nhấn âm tiết THỨ HAI: repeat /rɪˈpiːt/, explain /ɪkˈspleɪn/, confirm /kənˈfɜːm/.",
    ruleEn: "Most two-syllable verbs are stressed on the SECOND syllable: repeat /rɪˈpiːt/, explain /ɪkˈspleɪn/, confirm /kənˈfɜːm/.",
    rememberVi: "Động từ \"đến sau\": nhấn SAU.",
    rememberEn: "Verbs follow: stress comes second.",
    mistakeVi: "Nhấn âm tiết đầu theo thói quen: confirm → \"CON-firm\".",
    mistakeEn: "Stressing the first syllable by habit: confirm → \"CON-firm\".",
    caution: `${STRESS_CAUTION} Many verbs (answer, visit, open, offer) are exceptions; do not use them here.`
  },
  "b1-stress-compound": {
    ruleVi: "Danh từ ghép thường nhấn phần ĐẦU, dù viết liền hay tách: laptop /ˈlæptɒp/, deadline, car park /ˈkɑː pɑːk/.",
    ruleEn: "Compound nouns are usually stressed on the FIRST part, written as one word or two: laptop /ˈlæptɒp/, deadline, car park /ˈkɑː pɑːk/.",
    rememberVi: "Phần đầu cho biết \"loại gì\" nên được nhấn.",
    rememberEn: "The first part tells you which kind, so it carries the stress.",
    mistakeVi: "Nhấn đều hai phần hoặc nhấn phần sau như một cụm tính từ + danh từ.",
    mistakeEn: "Stressing both parts equally, or the second part like an adjective + noun.",
    caution: `${STRESS_CAUTION} Some compounds vary (e.g. some place-name compounds); choose clear first-stressed ones.`
  },
  "b1-stress-shift": {
    ruleVi: "Một số từ hai âm tiết đổi trọng âm theo từ loại: danh từ nhấn đầu, động từ nhấn sau — ˈrecord (n) / reˈcord (v), ˈpresent / preˈsent.",
    ruleEn: "Some two-syllable words change stress with the part of speech: nouns stress the first syllable, verbs the second — ˈrecord (n) / reˈcord (v), ˈpresent / preˈsent.",
    rememberVi: "Noun trước, Verb sau — như thứ tự chữ N, V.",
    rememberEn: "Noun first, Verb second.",
    mistakeVi: "Đọc một kiểu cho cả danh từ và động từ.",
    mistakeEn: "Using one stress for both the noun and the verb.",
    caution: `${STRESS_CAUTION} Vowels often change with stress (ˈrekɔːd / rɪˈkɔːd); transcribe each form separately.`
  },
  "b1-suffix-tion": {
    ruleVi: "Từ tận cùng -tion/-sion luôn nhấn âm tiết NGAY TRƯỚC hậu tố: inforˈmation, deˈcision, presenˈtation.",
    ruleEn: "Words ending in -tion/-sion are stressed on the syllable JUST BEFORE the suffix: inforˈmation, deˈcision, presenˈtation.",
    rememberVi: "Nhấn ngay trước -tion.",
    rememberEn: "Stress sits right before -tion.",
    mistakeVi: "Nhấn vào chính -tion hoặc vào âm tiết đầu: \"IN-for-ma-tion\".",
    mistakeEn: "Stressing -tion itself or the first syllable: \"IN-for-ma-tion\".",
    caution: STRESS_CAUTION
  },
  "b1-suffix-ic": {
    ruleVi: "Từ tận cùng -ic nhấn âm tiết ngay trước -ic (ecoˈnomic, speˈcific); -ical cũng giữ trọng âm ở đó (ˈtechnical, eˈlectrical).",
    ruleEn: "Words ending in -ic are stressed just before -ic (ecoˈnomic, speˈcific); -ical keeps the stress in the same place (ˈtechnical, eˈlectrical).",
    rememberVi: "Nhấn ngay trước -ic, thêm -al không đổi chỗ nhấn.",
    rememberEn: "Stress right before -ic; adding -al does not move it.",
    mistakeVi: "Nhấn âm tiết đầu theo từ gốc: economic → \"E-co-no-mic\".",
    mistakeEn: "Keeping the stress of the base word: economic → \"E-co-no-mic\".",
    caution: `${STRESS_CAUTION} Exceptions such as ˈpolitics, ˈArabic, ˈcatholic should not be used.`
  },
  "b1-suffix-ity": {
    ruleVi: "Từ tận cùng -ity nhấn âm tiết ngay trước -ity: aˈbility, ˈquality, responsiˈbility.",
    ruleEn: "Words ending in -ity are stressed on the syllable just before -ity: aˈbility, ˈquality, responsiˈbility.",
    rememberVi: "Đếm lùi: âm tiết thứ ba từ cuối (trước i-ty).",
    rememberEn: "Count back: the third syllable from the end (before i-ty).",
    mistakeVi: "Giữ trọng âm của từ gốc: able → ability đọc \"A-bi-li-ty\".",
    mistakeEn: "Keeping the stress of the base word: ability said as \"A-bi-li-ty\".",
    caution: STRESS_CAUTION
  },
  "b1-suffix-teen-ty": {
    ruleVi: "Số -teen nhấn âm tiết CUỐI và /t/ rõ, nguyên âm dài: fifˈteen /fɪfˈtiːn/; số -ty nhấn âm tiết ĐẦU: ˈfifty /ˈfɪfti/.",
    ruleEn: "-teen numbers are stressed on the LAST syllable with a clear /t/ and long vowel: fifˈteen /fɪfˈtiːn/; -ty numbers on the FIRST: ˈfifty /ˈfɪfti/.",
    rememberVi: "-TEEN kéo dài ở cuối; -ty ngắn và nhẹ.",
    rememberEn: "-TEEN is long at the end; -ty is short and light.",
    mistakeVi: "Đọc 15 và 50 giống nhau, khiến người nghe nhầm số.",
    mistakeEn: "Saying 15 and 50 the same way, so listeners get the wrong number.",
    caution: "-teen is stressed last and -ty first when said alone or at the end of a phrase; before a stressed noun -teen may shift to the first syllable (ˈfifteen ˈpeople) — use isolated numbers or end positions."
  },
  // ---------------------------------------------------------------- B2
  "b2-weak-articles": {
    ruleVi: "Khi không nhấn, a/an/the đọc yếu với /ə/: a /ə/, an /ən/, the /ðə/ (trước nguyên âm thường /ði/).",
    ruleEn: "Unstressed a/an/the use the weak vowel /ə/: a /ə/, an /ən/, the /ðə/ (often /ði/ before a vowel).",
    rememberVi: "Mạo từ là \"âm đệm\": nhanh, nhẹ, dính vào danh từ sau.",
    rememberEn: "Articles are fillers: quick, light and joined to the next noun.",
    mistakeVi: "Đọc mạnh từng mạo từ /eɪ/, /ðiː/ khiến câu nặng và đứt.",
    mistakeEn: "Saying every article strongly /eɪ/, /ðiː/, so the sentence sounds heavy.",
    caution: "Weak forms are the norm when unstressed, not on every function word: strong forms are used for emphasis, contrast or at the end of a phrase. Do not force /ðə/ before a vowel; /ði/ and /ðə/ are both heard."
  },
  "b2-weak-prepositions": {
    ruleVi: "Giới từ không nhấn đọc yếu: to /tə/, for /fə/, of /əv/, at /ət/, from /frəm/.",
    ruleEn: "Unstressed prepositions are weak: to /tə/, for /fə/, of /əv/, at /ət/, from /frəm/.",
    rememberVi: "Từ nội dung mạnh, giới từ giữa câu lướt qua với /ə/.",
    rememberEn: "Content words are strong; prepositions in the middle glide past with /ə/.",
    mistakeVi: "Đọc to /tuː/, for /fɔː/ đầy đủ ở mọi chỗ.",
    mistakeEn: "Saying to /tuː/ and for /fɔː/ in full everywhere.",
    caution: "Prepositions at the end of a sentence (Who is it for?) or under contrast keep their strong form; do not mark every preposition weak."
  },
  "b2-weak-auxiliaries": {
    ruleVi: "Trợ động từ không nhấn đọc yếu: can /kən/, have /həv/ hoặc /əv/, was /wəz/, do /də/.",
    ruleEn: "Unstressed auxiliaries are weak: can /kən/, have /həv/ or /əv/, was /wəz/, do /də/.",
    rememberVi: "Trợ động từ ở giữa câu khẳng định: yếu; ở cuối câu hoặc câu trả lời ngắn: mạnh (Yes, I can /kæn/).",
    rememberEn: "Mid-sentence in statements: weak; at the end or in short answers: strong (Yes, I can /kæn/).",
    mistakeVi: "Đọc can /kæn/ mạnh trong câu khẳng định nên dễ bị nghe thành can't.",
    mistakeEn: "Saying a strong can /kæn/ in statements, which can sound like can't.",
    caution: "Negative forms (can't, wasn't) and auxiliaries at the end of a clause are strong; do not weaken them."
  },
  "b2-weak-conjunctions": {
    ruleVi: "Từ nối không nhấn đọc yếu: and /ən/ hoặc /n/, but /bət/, or /ə/, than /ðən/, that /ðət/.",
    ruleEn: "Unstressed conjunctions are weak: and /ən/ or /n/, but /bət/, or /ə/, than /ðən/, that /ðət/.",
    rememberVi: "\"fish and chips\" nghe như \"fish 'n' chips\".",
    rememberEn: "\"fish and chips\" sounds like \"fish 'n' chips\".",
    mistakeVi: "Đọc and /ænd/ rõ từng từ, làm câu bị ngắt.",
    mistakeEn: "Saying a full and /ænd/ each time, which breaks the flow.",
    caution: "that as a demonstrative (that file) is strong; only the conjunction/relative that is weak."
  },
  "b2-link-cv": {
    ruleVi: "Phụ âm cuối của một từ nối sang nguyên âm đầu của từ sau như thể chung một âm tiết: check it /tʃek‿ɪt/, send an email.",
    ruleEn: "A word's final consonant joins the vowel at the start of the next word, as if in one syllable: check it /tʃek‿ɪt/, send an email.",
    rememberVi: "Chuyển phụ âm cuối sang đầu từ sau: \"che-kit\".",
    rememberEn: "Move the final consonant to the next word: \"che-kit\".",
    mistakeVi: "Ngắt từng từ và thêm hơi chặn, hoặc bỏ phụ âm cuối.",
    mistakeEn: "Stopping after each word or dropping the final consonant.",
    caution: "Link only consonant + vowel boundaries that a natural speaker would join; do not mark every boundary."
  },
  "b2-link-vv": {
    ruleVi: "Nguyên âm + nguyên âm: sau /iː ɪ eɪ aɪ ɔɪ/ thường chen nhẹ /j/ (the end /ðiː‿j‿end/); sau /uː ʊ əʊ aʊ/ chen nhẹ /w/ (go out /ɡəʊ‿w‿aʊt/).",
    ruleEn: "Vowel + vowel: after /iː ɪ eɪ aɪ ɔɪ/ a light /j/ often joins them (the end /ðiː‿j‿end/); after /uː ʊ əʊ aʊ/ a light /w/ (go out /ɡəʊ‿w‿aʊt/).",
    rememberVi: "Môi tròn ở cuối → /w/; miệng dẹt ở cuối → /j/.",
    rememberEn: "Rounded lips at the end → /w/; spread lips → /j/.",
    mistakeVi: "Ngắt hẳn giữa hai nguyên âm hoặc thêm âm chặn.",
    mistakeEn: "Stopping hard between the two vowels.",
    caution: "The /j/ or /w/ glide is light and only after the vowels listed; do not insert /j/ or /w/ in every vowel + vowel link (e.g. after /ə/ or /ɑː/ there is none, or linking /r/ in some accents)."
  },
  "b2-elision-t-d": {
    ruleVi: "Trong nói nhanh, /t/ hoặc /d/ nằm giữa hai phụ âm thường bị lược: next week /neks(t) wiːk/, old man /əʊl(d) mæn/.",
    ruleEn: "In fast speech, /t/ or /d/ between two consonants is often dropped: next week /neks(t) wiːk/, old man /əʊl(d) mæn/.",
    rememberVi: "Ba phụ âm liền nhau → âm /t/, /d/ ở giữa \"biến mất\".",
    rememberEn: "Three consonants in a row → the middle /t/ or /d/ disappears.",
    mistakeVi: "Áp dụng sai khi từ đứng một mình (cost → \"cos\") làm mất nghĩa.",
    mistakeEn: "Dropping /t/ in a word said alone (cost → \"coss\"), which changes the meaning.",
    caution: "Elision is optional and depends on speed; show the dropped sound in brackets and never drop /t/ or /d/ before a vowel or in careful speech."
  },
  "b2-assimilation": {
    ruleVi: "/t/ + /j/ → /tʃ/ và /d/ + /j/ → /dʒ/ khi nói nhanh: meet you /ˈmiːtʃuː/, did you /ˈdɪdʒuː/.",
    ruleEn: "/t/ + /j/ becomes /tʃ/ and /d/ + /j/ becomes /dʒ/ in fast speech: meet you /ˈmiːtʃuː/, did you /ˈdɪdʒuː/.",
    rememberVi: "\"t + you\" = \"chu\", \"d + you\" = \"giu\".",
    rememberEn: "\"t + you\" = \"choo\", \"d + you\" = \"joo\".",
    mistakeVi: "Không nhận ra khi nghe, hoặc ép đồng hóa cả khi nói chậm.",
    mistakeEn: "Not recognising it when listening, or forcing it in slow, careful speech.",
    caution: "Assimilation is optional and informal; both the assimilated and the careful form are correct."
  },
  "b2-stress-content": {
    ruleVi: "Trong câu, từ nội dung (danh từ, động từ chính, tính từ, trạng từ, từ phủ định) được nhấn; từ chức năng (mạo từ, giới từ, trợ động từ, đại từ) đọc nhẹ.",
    ruleEn: "In a sentence, content words (nouns, main verbs, adjectives, adverbs, negatives) are stressed; function words (articles, prepositions, auxiliaries, pronouns) are light.",
    rememberVi: "Nếu chỉ nghe các từ được nhấn, người nghe vẫn hiểu ý chính (như tin nhắn điện báo).",
    rememberEn: "The stressed words alone should still carry the message, like a telegram.",
    mistakeVi: "Nhấn đều mọi từ như tiếng Việt, khiến ý chính không nổi bật.",
    mistakeEn: "Stressing every word equally, as in Vietnamese, so the key words do not stand out.",
    caution: "Sentence stress depends on meaning: do not mark every content word in CAPITALS; mark the two or three a natural speaker would stress."
  },
  "b2-stress-rhythm": {
    ruleVi: "Tiếng Anh có nhịp theo trọng âm: các âm tiết nhấn cách đều nhau, âm tiết không nhấn ở giữa được nói nhanh và nhẹ hơn.",
    ruleEn: "English is stress-timed: stressed syllables come at regular beats, and the unstressed syllables between them are squeezed and quick.",
    rememberVi: "Gõ tay theo từ được nhấn; các từ còn lại phải \"chen\" vào giữa nhịp.",
    rememberEn: "Tap on the stressed words; the rest must fit between the taps.",
    mistakeVi: "Đọc mọi âm tiết dài bằng nhau như tiếng Việt.",
    mistakeEn: "Giving every syllable the same length, as in Vietnamese.",
    caution: PROSODY_CAUTION
  },
  "b2-stress-contrast": {
    ruleVi: "Khi so sánh hoặc đối lập hai lựa chọn, nhấn mạnh từ mang sự khác biệt: I said TUESDAY, not THURSDAY.",
    ruleEn: "When comparing or contrasting two options, stress the words that differ: I said TUESDAY, not THURSDAY.",
    rememberVi: "Nhấn vào chỗ \"khác nhau\".",
    rememberEn: "Stress the difference.",
    mistakeVi: "Giữ trọng âm bình thường nên người nghe không thấy sự đối lập.",
    mistakeEn: "Keeping normal stress, so the contrast is lost.",
    caution: PROSODY_CAUTION
  },
  "b2-stress-phrasal": {
    ruleVi: "Cụm động từ thường nhấn tiểu từ: set UP, carry ON, look INTO (khi tiểu từ ở cuối hoặc mang nghĩa chính).",
    ruleEn: "Phrasal verbs often stress the particle: set UP, carry ON, look INTO (especially at the end of a clause).",
    rememberVi: "Tiểu từ thay đổi nghĩa nên thường được nhấn.",
    rememberEn: "The particle changes the meaning, so it usually takes the stress.",
    mistakeVi: "Nhấn động từ và đọc nhẹ tiểu từ như giới từ.",
    mistakeEn: "Stressing the verb and reducing the particle like a preposition.",
    caution: "Particle stress is a tendency: when an object noun follows, the noun often takes the main stress (set up the MEETING). Do not mark the particle in every case."
  },
  "b2-intonation-fall": {
    ruleVi: "Câu trần thuật và câu hỏi Wh- thường xuống giọng ↘ ở từ được nhấn cuối: We start at nine ↘. Where's the file ↘?",
    ruleEn: "Statements and Wh- questions usually fall ↘ on the last stressed word: We start at nine ↘. Where's the file ↘?",
    rememberVi: "Xuống giọng = câu đã xong, thông tin chắc chắn.",
    rememberEn: "A fall means finished and certain.",
    mistakeVi: "Lên giọng cuối câu Wh- như câu Yes/No, nghe như không chắc.",
    mistakeEn: "Rising at the end of Wh- questions like yes/no questions, which sounds unsure.",
    caution: "A rising Wh- question is also natural when friendly or checking; do not present the fall as the only correct tone."
  },
  "b2-intonation-rise": {
    ruleVi: "Câu hỏi Yes/No thường lên giọng ↗ ở cuối: Are you free on Monday ↗?",
    ruleEn: "Yes/no questions usually rise ↗ at the end: Are you free on Monday ↗?",
    rememberVi: "Lên giọng = đang chờ câu trả lời có/không.",
    rememberEn: "A rise means waiting for a yes or no.",
    mistakeVi: "Đọc phẳng như câu trần thuật nên người nghe không biết là câu hỏi.",
    mistakeEn: "Using a flat tone, so it does not sound like a question.",
    caution: "Yes/no questions can also fall (e.g. when insisting); the rise is the common, neutral choice, not the only one."
  },
  "b2-intonation-tag": {
    ruleVi: "Câu hỏi đuôi xuống giọng ↘ khi bạn chắc và chờ xác nhận; lên giọng ↗ khi thật sự hỏi: It's ready, isn't it ↘/↗?",
    ruleEn: "A question tag falls ↘ when you are sure and expect agreement; it rises ↗ when you really ask: It's ready, isn't it ↘/↗?",
    rememberVi: "Chắc → xuống; không chắc → lên.",
    rememberEn: "Sure → fall; not sure → rise.",
    mistakeVi: "Luôn lên giọng, làm câu nghe như không biết gì.",
    mistakeEn: "Always rising, which sounds as if you know nothing.",
    caution: PROSODY_CAUTION
  },
  "b2-intonation-list": {
    ruleVi: "Khi liệt kê, các mục đầu lên giọng ↗, mục cuối xuống giọng ↘: reports ↗, invoices ↗ and contracts ↘.",
    ruleEn: "In a list, the first items rise ↗ and the last item falls ↘: reports ↗, invoices ↗ and contracts ↘.",
    rememberVi: "Lên = \"còn nữa\", xuống = \"hết rồi\".",
    rememberEn: "Rise = more to come; fall = that's all.",
    mistakeVi: "Đọc phẳng tất cả, người nghe không biết danh sách kết thúc ở đâu.",
    mistakeEn: "Using a flat tone, so listeners cannot tell where the list ends.",
    caution: "An open list (and so on) may end with a rise; mark the common closed-list pattern."
  },
  "b2-intonation-polite": {
    ruleVi: "Lời đề nghị lịch sự (Could you…, Would you mind…) thường có giọng lên nhẹ hoặc xuống-lên, nghe mềm hơn: Could you send it today ↗?",
    ruleEn: "Polite requests (Could you…, Would you mind…) usually have a gentle rise or fall-rise, which sounds softer: Could you send it today ↗?",
    rememberVi: "Giọng lên nhẹ = mềm mỏng; giọng xuống mạnh = ra lệnh.",
    rememberEn: "A gentle rise sounds soft; a strong fall sounds like an order.",
    mistakeVi: "Đọc phẳng hoặc xuống mạnh nên nghe cộc lốc dù câu chữ lịch sự.",
    mistakeEn: "A flat or sharp falling tone, which sounds blunt even with polite words.",
    caution: PROSODY_CAUTION
  },
  "b2-chunking": {
    ruleVi: "Chia câu dài thành các cụm ý (thường là một cụm ngữ pháp) và ngắt nhẹ | giữa các cụm: The report | for the client | is ready.",
    ruleEn: "Split a long sentence into thought groups (usually grammatical phrases) with a short pause | between them: The report | for the client | is ready.",
    rememberVi: "Mỗi cụm là một ý; ngắt ở dấu phẩy và trước cụm mới.",
    rememberEn: "One idea per chunk; pause at commas and before a new phrase.",
    mistakeVi: "Ngắt giữa cụm (the | report) hoặc đọc một hơi không ngắt.",
    mistakeEn: "Pausing inside a phrase (the | report) or reading it all in one breath.",
    caution: "Pause positions can vary; never put | between an article and its noun or inside a word."
  },
  "b2-numbers": {
    ruleVi: "Số, ngày, giá tiền là thông tin quan trọng: đọc rõ, nhấn và thường xuống giọng ↘ ở con số: The total is £250 ↘. The meeting is on 3rd May ↘.",
    ruleEn: "Numbers, dates and prices are key information: say them clearly, stress them and usually fall ↘ on the figure: The total is £250 ↘. The meeting is on 3rd May ↘.",
    rememberVi: "Con số nào quan trọng thì chậm lại và nhấn vào nó.",
    rememberEn: "Slow down and stress the figure that matters.",
    mistakeVi: "Đọc số quá nhanh, quên đơn vị (pounds, percent) hoặc đọc ngày sai thứ tự.",
    mistakeEn: "Saying figures too fast, dropping the unit (pounds, percent) or the date order.",
    caution: "Accept both British and American date and number styles (the third of May / May third; one hundred and fifty / one hundred fifty)."
  },
  "b2-unfinished": {
    ruleVi: "Mệnh đề chưa kết thúc (trước dấu phẩy) thường lên giọng nhẹ ↗ báo hiệu \"còn tiếp\": When the report is ready ↗, I'll send it ↘.",
    ruleEn: "An unfinished clause (before a comma) usually has a slight rise ↗ meaning \"more to come\": When the report is ready ↗, I'll send it ↘.",
    rememberVi: "Lên ở giữa câu, xuống ở cuối câu.",
    rememberEn: "Rise in the middle, fall at the end.",
    mistakeVi: "Xuống giọng ngay sau mệnh đề đầu, nghe như câu đã hết.",
    mistakeEn: "Falling after the first clause, so it sounds finished.",
    caution: "A level tone is also acceptable before the comma; do not insist on a big rise."
  },
  "b2-teen-ty": {
    ruleVi: "Phân biệt số dễ nhầm: -teen nhấn cuối, /t/ rõ, nguyên âm dài (thirˈteen); -ty nhấn đầu, âm cuối ngắn (ˈthirty). Khi cần, nói lại kiểu \"one-five\".",
    ruleEn: "Keep confusable numbers apart: -teen is stressed last with a clear /t/ and long vowel (thirˈteen); -ty is stressed first with a short ending (ˈthirty). When needed, clarify: \"one-five\".",
    rememberVi: "Kéo dài -TEEN; -ty ngắn gọn.",
    rememberEn: "Stretch -TEEN; keep -ty short.",
    mistakeVi: "Đọc 13 và 30 giống nhau trong cuộc gọi, dẫn đến sai giá, sai giờ.",
    mistakeEn: "Saying 13 and 30 the same on a call, causing wrong prices or times.",
    caution: "Before a stressed noun -teen may shift stress forward (ˈfifteen ˈminutes); in American English -ty often has a flapped t. Both are acceptable."
  },
  "b2-symbols": {
    ruleVi: "Đọc email, đường dẫn và ký hiệu bằng tên của chúng: @ = at, . = dot, / = slash, _ = underscore, - = hyphen hoặc dash; đánh vần tên lạ từng chữ.",
    ruleEn: "Say emails, web addresses and symbols by their names: @ = at, . = dot, / = slash, _ = underscore, - = hyphen or dash; spell unusual names letter by letter.",
    rememberVi: "Ngắt nhẹ trước mỗi ký hiệu để người nghe ghi kịp.",
    rememberEn: "Pause slightly before each symbol so the listener can write it down.",
    mistakeVi: "Đọc \"a còng\", \"chấm\" bằng tiếng Việt hoặc đọc dấu chấm thành \"point\".",
    mistakeEn: "Saying symbols in Vietnamese or reading . as \"point\".",
    caution: "Use invented example addresses only (no real company domains); accept dash and hyphen."
  },
  "b2-abbreviations": {
    ruleVi: "Từ viết tắt đọc từng chữ thường nhấn chữ CUỐI: HR /ˌeɪtʃ ˈɑː/, CEO /ˌsiː iː ˈəʊ/; từ viết tắt đọc như một từ thì nhấn như từ thường (ASAP có thể đọc /ˌeɪ es eɪ ˈpiː/ hoặc /ˈeɪsæp/).",
    ruleEn: "Letter-by-letter abbreviations usually stress the LAST letter: HR /ˌeɪtʃ ˈɑː/, CEO /ˌsiː iː ˈəʊ/; acronyms said as words are stressed like words (ASAP: /ˌeɪ es eɪ ˈpiː/ or /ˈeɪsæp/).",
    rememberVi: "Đọc từng chữ → nhấn chữ cuối.",
    rememberEn: "Spelt out → stress the last letter.",
    mistakeVi: "Đọc tên chữ cái theo kiểu tiếng Việt (H = \"hát\", R = \"e-rờ\").",
    mistakeEn: "Using Vietnamese letter names (H = \"hát\", R = \"e-rờ\").",
    caution: "Letter names differ between accents (Z = /zed/ BrE, /ziː/ AmE; H = /eɪtʃ/, also /heɪtʃ/); accept both."
  },
  "b2-office-words": {
    ruleVi: "Một số từ công sở hay bị đọc sai trọng âm hoặc âm: ˈcolleague, ˈschedule, deˈvelop, ˈcategory, ˈcompany — học kèm phiên âm và trọng âm của từng từ.",
    ruleEn: "Some office words are often mis-stressed or mispronounced: ˈcolleague, ˈschedule, deˈvelop, ˈcategory, ˈcompany — learn each with its IPA and stress.",
    rememberVi: "Khi gặp từ mới, tra trọng âm và ghi dấu ˈ trước âm tiết nhấn.",
    rememberEn: "For each new word, check the stress and mark ˈ before the stressed syllable.",
    mistakeVi: "Đọc theo mặt chữ: colleague → \"cô-líc\", develop → \"ĐE-ve-lốp\".",
    mistakeEn: "Reading from the spelling: colleague → \"co-LEAGUE\", develop → \"DE-ve-lop\".",
    caution: "Accept British and American variants (schedule /ˈʃedjuːl/ BrE, /ˈskedʒuːl/ AmE); do not treat one accent as the only correct one."
  },
  // ---------------------------------------------------------------- C1
  "c1-stress-suffix-shift": {
    ruleVi: "Một số hậu tố tự mang trọng âm và kéo trọng âm về cuối: -ee, -eer, -ese, -ique, -ette (employˈee, engiˈneer, Japaˈnese, uˈnique); -ion/-ian nhấn ngay trước hậu tố.",
    ruleEn: "Some suffixes take the stress themselves: -ee, -eer, -ese, -ique, -ette (employˈee, engiˈneer, Japaˈnese, uˈnique); -ion/-ian stress the syllable just before.",
    rememberVi: "Hậu tố \"nước ngoài\" (-ee, -eer, -ese, -ique) giữ trọng âm cho chính nó.",
    rememberEn: "Borrowed-looking suffixes (-ee, -eer, -ese, -ique) keep the stress for themselves.",
    mistakeVi: "Giữ trọng âm của từ gốc: employee → \"em-PLOY-ee\".",
    mistakeEn: "Keeping the base-word stress: employee → \"em-PLOY-ee\".",
    caution: `${STRESS_CAUTION} employee also has /ɪmˈplɔɪiː/ in some speakers; prefer clear cases.`
  },
  "c1-stress-compound-phrase": {
    ruleVi: "Danh từ ghép nhấn phần đầu (a ˈgreenhouse = nhà kính); cụm tính từ + danh từ nhấn danh từ (a green ˈhouse = ngôi nhà màu xanh). Trọng âm thay đổi nghĩa.",
    ruleEn: "Compound nouns stress the first part (a ˈgreenhouse); adjective + noun phrases stress the noun (a green ˈhouse). The stress changes the meaning.",
    rememberVi: "Một khái niệm → nhấn đầu; mô tả → nhấn danh từ.",
    rememberEn: "One concept → stress first; a description → stress the noun.",
    mistakeVi: "Nhấn giống nhau cho cả hai nên người nghe hiểu sai nghĩa.",
    mistakeEn: "Using the same stress for both, so the meaning is unclear.",
    caution: STRESS_CAUTION
  },
  "c1-stress-multi-compound": {
    ruleVi: "Danh từ ghép nhiều thành phần thường giữ trọng âm chính ở thành phần mang ý phân loại (thường là phần đầu): ˈcustomer service team, ˈsales target review.",
    ruleEn: "Multi-part compound nouns usually keep the main stress on the classifying part, often the first: ˈcustomer service team, ˈsales target review.",
    rememberVi: "Tìm phần cho biết \"loại nào\" và nhấn vào đó.",
    rememberEn: "Find the part that says which kind and stress it.",
    mistakeVi: "Nhấn mạnh mọi thành phần nên cụm nghe rời rạc.",
    mistakeEn: "Stressing every part, so the compound sounds broken up.",
    caution: "Main stress in long compounds can vary with context and contrast; mark one natural main stress, not one per word."
  },
  "c1-stress-phrasal-noun-verb": {
    ruleVi: "Danh từ tạo từ cụm động từ nhấn phần đầu (a ˈsetup, a ˈbackup); cụm động từ nhấn tiểu từ (set ˈup, back ˈup).",
    ruleEn: "Nouns formed from phrasal verbs stress the first part (a ˈsetup, a ˈbackup); the phrasal verb stresses the particle (set ˈup, back ˈup).",
    rememberVi: "Danh từ: nhấn trước; động từ: nhấn tiểu từ.",
    rememberEn: "Noun: stress first; verb: stress the particle.",
    mistakeVi: "Đọc danh từ và động từ giống nhau.",
    mistakeEn: "Saying the noun and the verb the same way.",
    caution: "Phrasal verbs often stress the particle, but an object noun after it may take the main stress; mark the citation forms."
  },
  "c1-elision-syllable": {
    ruleVi: "Trong nhiều từ, một âm tiết /ə/ không nhấn bị lược khi nói: different /ˈdɪfrənt/, business /ˈbɪznəs/, comfortable /ˈkʌmftəbl/.",
    ruleEn: "In many words an unstressed /ə/ syllable is dropped in speech: different /ˈdɪfrənt/, business /ˈbɪznəs/, comfortable /ˈkʌmftəbl/.",
    rememberVi: "Đếm âm tiết khi nghe, không theo mặt chữ.",
    rememberEn: "Count the syllables you hear, not the ones you see.",
    mistakeVi: "Đọc đủ mọi âm tiết theo chữ viết: business → \"bi-zi-nét\".",
    mistakeEn: "Saying every written syllable: business → \"bi-zi-ness\".",
    caution: "Some words have both full and reduced forms (ˈdɪfərənt / ˈdɪfrənt); show the common reduced form but accept the full one."
  },
  "c1-elision-cluster": {
    ruleVi: "Trong cụm phụ âm dài, /t/ hoặc /d/ ở giữa thường bị lược khi nói nhanh: last month /lɑːs(t) mʌnθ/, handbook /ˈhæn(d)bʊk/.",
    ruleEn: "In long consonant clusters, a middle /t/ or /d/ is often dropped in fast speech: last month /lɑːs(t) mʌnθ/, handbook /ˈhæn(d)bʊk/.",
    rememberVi: "Âm /t/, /d/ kẹt giữa hai phụ âm → nhẹ hoặc mất.",
    rememberEn: "A /t/ or /d/ trapped between consonants becomes weak or disappears.",
    mistakeVi: "Lược cả khi theo sau là nguyên âm (last of → \"las of\").",
    mistakeEn: "Dropping it even before a vowel (last of → \"lass of\").",
    caution: "Elision is optional; show the dropped sound in brackets and never present it as the only correct form."
  },
  "c1-reduced-forms": {
    ruleVi: "Trong hội thoại thân mật có dạng rút gọn: going to → gonna, want to → wanna, got to → gotta, do you → d'you. Chủ yếu để NHẬN BIẾT khi nghe.",
    ruleEn: "Informal speech has reduced forms: going to → gonna, want to → wanna, got to → gotta, do you → d'you. They are mainly for RECOGNITION when listening.",
    rememberVi: "Nghe hiểu là chính; khi nói ở công sở nên dùng dạng đầy đủ.",
    rememberEn: "Understand them; in formal workplace speech prefer the full form.",
    mistakeVi: "Dùng gonna/wanna trong email hoặc buổi họp trang trọng.",
    mistakeEn: "Using gonna/wanna in emails or formal meetings.",
    caution: "Present reduced forms as informal and for recognition; never write them as the only correct form."
  },
  "c1-long-linking": {
    ruleVi: "Trong câu dài, kết hợp nhiều kiểu nối (phụ âm + nguyên âm, /j/ /w/, lược âm) để câu trôi chảy trong mỗi cụm ý; giữa các cụm vẫn ngắt nghỉ.",
    ruleEn: "In long sentences, combine several kinds of linking (consonant + vowel, /j/ /w/, elision) so each thought group flows; still pause between groups.",
    rememberVi: "Nối trong cụm, ngắt giữa cụm.",
    rememberEn: "Link inside a chunk, pause between chunks.",
    mistakeVi: "Nối cả câu một mạch khiến người nghe không theo kịp, hoặc tách từng từ.",
    mistakeEn: "Running the whole sentence together, or separating every word.",
    caution: "Do not mark a link at every boundary or insert /j/ /w/ in every vowel + vowel link; mark only natural links."
  },
  "c1-attitude-interest": {
    ruleVi: "Biên độ giọng rộng (lên cao rồi xuống rõ ↗↘) thể hiện sự quan tâm hoặc ngạc nhiên: Really ↗↘? That's great news ↘!",
    ruleEn: "A wide pitch range (a high rise then a clear fall ↗↘) shows interest or surprise: Really ↗↘? That's great news ↘!",
    rememberVi: "Giọng càng \"lên xuống\" rõ càng nghe quan tâm.",
    rememberEn: "The more your pitch moves, the more interested you sound.",
    mistakeVi: "Giọng phẳng khiến người nghe tưởng bạn không quan tâm.",
    mistakeEn: "A flat tone, which sounds uninterested.",
    caution: PROSODY_CAUTION
  },
  "c1-attitude-partial": {
    ruleVi: "Giọng xuống-lên ↘↗ thể hiện đồng ý một phần hoặc còn do dự, thường đi kèm \"but…\": That's true ↘↗, but…",
    ruleEn: "A fall-rise ↘↗ shows partial agreement or hesitation, often before \"but…\": That's true ↘↗, but…",
    rememberVi: "Xuống-lên = \"đúng, nhưng…\".",
    rememberEn: "Fall-rise = \"yes, but…\".",
    mistakeVi: "Xuống giọng dứt khoát nên nghe như đồng ý hoàn toàn.",
    mistakeEn: "A firm fall, which sounds like full agreement.",
    caution: PROSODY_CAUTION
  },
  "c1-attitude-polite": {
    ruleVi: "Cùng một câu, giọng xuống mạnh và phẳng nghe cộc lốc; giọng mềm, có lên xuống và từ rào đón (perhaps, could) nghe lịch sự.",
    ruleEn: "The same words sound blunt with a sharp, flat fall, and polite with a softer, varied tone and hedges (perhaps, could).",
    rememberVi: "Lịch sự = chậm hơn một chút, giọng mềm, kết thúc nhẹ.",
    rememberEn: "Polite = a little slower, softer, with a gentle ending.",
    mistakeVi: "Dùng giọng phẳng của tiếng Việt khi nói tiếng Anh nên dễ bị hiểu là khó chịu.",
    mistakeEn: "A flat tone carried over from Vietnamese, which can sound annoyed.",
    caution: "Politeness depends on culture and context; do not present one tone as universally polite."
  },
  "c1-attitude-certainty": {
    ruleVi: "Xuống giọng dứt khoát ↘ thể hiện chắc chắn; giọng xuống-lên ↘↗ hoặc lên nhẹ thể hiện chưa chắc: It'll be ready ↘. / It should be ready ↘↗…",
    ruleEn: "A firm fall ↘ shows certainty; a fall-rise ↘↗ or slight rise shows uncertainty: It'll be ready ↘. / It should be ready ↘↗…",
    rememberVi: "Chắc → xuống hẳn; chưa chắc → để lửng.",
    rememberEn: "Certain → fall fully; unsure → leave it open.",
    mistakeVi: "Lên giọng cuối câu khi báo cáo, làm thông tin nghe thiếu tin cậy.",
    mistakeEn: "Rising at the end when reporting facts, which sounds unreliable.",
    caution: PROSODY_CAUTION
  },
  "c1-emphasis-new": {
    ruleVi: "Trọng âm chính rơi vào thông tin MỚI; thông tin đã biết đọc nhẹ: We moved the meeting. — We moved it to FRIDAY.",
    ruleEn: "The main stress falls on NEW information; given information is light: We moved the meeting. — We moved it to FRIDAY.",
    rememberVi: "Nhấn cái người nghe chưa biết.",
    rememberEn: "Stress what the listener does not know yet.",
    mistakeVi: "Luôn nhấn từ cuối câu dù đó là thông tin cũ.",
    mistakeEn: "Always stressing the last word, even when it is old information.",
    caution: "Focus depends on context; mark the new item only and keep given words unstressed."
  },
  "c1-emphasis-aux": {
    ruleVi: "Nhấn trợ động từ để khẳng định mạnh hoặc phản bác: I DID send it. She HAS finished. (dùng do/does/did khi câu không có trợ động từ).",
    ruleEn: "Stress the auxiliary to insist or contradict: I DID send it. She HAS finished. (Add do/does/did when there is no auxiliary.)",
    rememberVi: "Muốn nói \"thật sự là có\" → nhấn trợ động từ.",
    rememberEn: "To say \"yes, really\" → stress the auxiliary.",
    mistakeVi: "Nhấn động từ chính thay vì trợ động từ nên không nghe ra ý phản bác.",
    mistakeEn: "Stressing the main verb instead, so the contradiction is lost.",
    caution: "The emphatic auxiliary takes its strong form; other auxiliaries in the sentence stay weak."
  },
  "c1-emphasis-cleft": {
    ruleVi: "Câu chẻ (What we need IS…, It's the BUDGET that…) đưa ý chính vào trọng tâm; nhấn và ngắt nhẹ trước phần thông tin chính.",
    ruleEn: "Cleft sentences (What we need IS…, It's the BUDGET that…) put the key idea in focus; stress it and pause slightly before it.",
    rememberVi: "What… | phần quan trọng.",
    rememberEn: "What… | then the important part.",
    mistakeVi: "Đọc đều cả câu nên câu chẻ mất tác dụng nhấn mạnh.",
    mistakeEn: "Reading it evenly, so the cleft loses its emphasis.",
    caution: PROSODY_CAUTION
  },
  "c1-emphasis-correction": {
    ruleVi: "Khi sửa thông tin, nhấn mạnh phần được sửa: It's not Tuesday, it's THURSDAY. Actually, it's FIFTEEN, not fifty.",
    ruleEn: "When correcting information, stress the corrected part: It's not Tuesday, it's THURSDAY. Actually, it's FIFTEEN, not fifty.",
    rememberVi: "Nhấn đúng chỗ sai để người nghe sửa lại.",
    rememberEn: "Stress exactly what was wrong.",
    mistakeVi: "Lặp lại cả câu với giọng bình thường nên người nghe không nhận ra chỗ sửa.",
    mistakeEn: "Repeating the whole sentence normally, so the correction is missed.",
    caution: PROSODY_CAUTION
  },
  "c1-present-pausing": {
    ruleVi: "Khi thuyết trình, ngắt nghỉ có chủ đích | trước và sau ý quan trọng để người nghe kịp tiếp nhận: Our sales | grew by twenty percent | this year.",
    ruleEn: "In presentations, pause on purpose | before and after key points so listeners can take them in: Our sales | grew by twenty percent | this year.",
    rememberVi: "Ngắt trước con số hoặc kết luận quan trọng.",
    rememberEn: "Pause before an important figure or conclusion.",
    mistakeVi: "Lấp khoảng nghỉ bằng \"ờ, à\" hoặc nói một mạch không nghỉ.",
    mistakeEn: "Filling pauses with \"er, um\" or never pausing.",
    caution: "Pause placement can vary; never pause inside a word or between an article and its noun."
  },
  "c1-present-pace": {
    ruleVi: "Thay đổi tốc độ: nói chậm hơn ở ý chính và số liệu, nhanh hơn ở phần phụ hoặc thông tin đã biết.",
    ruleEn: "Vary your pace: slow down for key points and figures, speed up for background or known information.",
    rememberVi: "Ý quan trọng = chậm lại.",
    rememberEn: "Important = slower.",
    mistakeVi: "Nói đều một tốc độ (thường quá nhanh) suốt bài.",
    mistakeEn: "Keeping one speed (often too fast) all the way through.",
    caution: PROSODY_CAUTION
  },
  "c1-present-transition": {
    ruleVi: "Khi chuyển ý (Moving on…, Next…, Let's turn to…), ngắt nhẹ, nâng cao giọng ở từ chuyển ý để báo hiệu phần mới.",
    ruleEn: "At transitions (Moving on…, Next…, Let's turn to…), pause and lift your pitch on the signpost to mark a new section.",
    rememberVi: "Từ chuyển ý = biển báo: nói rõ và cao giọng.",
    rememberEn: "Signposts are road signs: say them clearly with a higher pitch.",
    mistakeVi: "Lướt qua từ chuyển ý nên người nghe không biết đã sang phần mới.",
    mistakeEn: "Rushing the signpost, so listeners miss the change.",
    caution: PROSODY_CAUTION
  },
  "c1-present-figures": {
    ruleVi: "Nhấn mạnh số liệu và từ kết luận (so, therefore, overall): Sales rose by EIGHTY percent, SO we will expand.",
    ruleEn: "Stress figures and conclusion words (so, therefore, overall): Sales rose by EIGHTY percent, SO we will expand.",
    rememberVi: "Số liệu + kết luận = hai điểm nhấn chính.",
    rememberEn: "Figures and conclusions are the two main peaks.",
    mistakeVi: "Đọc số liệu nhỏ và nhanh như thông tin phụ.",
    mistakeEn: "Saying figures quickly and quietly, like background detail.",
    caution: "Accept BrE/AmE number styles (per cent / percent; one hundred and five / one hundred five)."
  },
  "c1-synthesis-report": {
    ruleVi: "Đọc diễn cảm đoạn báo cáo: chia cụm ý, nhấn thông tin mới và số liệu, xuống giọng ở cuối ý, lên nhẹ ở mệnh đề chưa xong.",
    ruleEn: "Read a report expressively: chunk it, stress new information and figures, fall at the end of each point and rise slightly on unfinished clauses.",
    rememberVi: "Cụm ý – nhấn – xuống giọng: ba bước cho mỗi câu.",
    rememberEn: "Chunk – stress – fall: three steps for each sentence.",
    mistakeVi: "Đọc như đọc chữ, đều giọng, không ngắt.",
    mistakeEn: "Reading word by word in a flat voice without pauses.",
    caution: PROSODY_CAUTION
  },
  "c1-synthesis-accents": {
    ruleVi: "Đồng nghiệp quốc tế có nhiều giọng khác nhau (Anh, Mỹ, Ấn, Singapore…); khác biệt thường ở nguyên âm, âm /r/ và nhịp. Hãy tập trung vào trọng âm và từ khóa.",
    ruleEn: "International colleagues have many accents (British, American, Indian, Singaporean…); differences are mostly in vowels, /r/ and rhythm. Focus on stress and key words.",
    rememberVi: "Không có một giọng \"đúng duy nhất\"; rõ ràng quan trọng hơn giọng.",
    rememberEn: "There is no single correct accent; clarity matters more than accent.",
    mistakeVi: "Cố bắt chước một giọng và cho rằng giọng khác là sai.",
    mistakeEn: "Copying one accent and treating others as wrong.",
    caution: "Never present one accent as the only correct one; accept BrE/AmE and other standard variants. Use neutral content, never stereotypes about any accent or nationality."
  },
  "c1-synthesis-online": {
    ruleVi: "Khi họp online, nói chậm hơn một chút, phát âm rõ phụ âm cuối, nhấn từ khóa và ngắt nghỉ để bù cho âm thanh kém hoặc độ trễ.",
    ruleEn: "In online meetings, speak a little slower, pronounce final consonants clearly, stress key words and pause to make up for poor audio and delay.",
    rememberVi: "Online = rõ hơn, chậm hơn, ngắt nhiều hơn.",
    rememberEn: "Online = clearer, slower, more pauses.",
    mistakeVi: "Nói nhanh và nuốt âm cuối khiến người nghe phải hỏi lại.",
    mistakeEn: "Speaking fast and dropping final sounds, so people ask you to repeat.",
    caution: PROSODY_CAUTION
  },
  "c1-synthesis-self": {
    ruleVi: "Tự ghi âm câu nói, nghe lại và so với mẫu: kiểm tra âm cuối, trọng âm từ, từ được nhấn trong câu và ngữ điệu cuối câu.",
    ruleEn: "Record yourself, listen back and compare with the model: check final sounds, word stress, sentence stress and the tone at the end.",
    rememberVi: "Mỗi lần chỉ sửa một điểm.",
    rememberEn: "Fix one thing at a time.",
    mistakeVi: "Chỉ nghe nội dung mà không để ý cách phát âm của mình.",
    mistakeEn: "Listening only to the content, not to how you sound.",
    caution: PROSODY_CAUTION
  }
};

/** Rule copy of a B1–C1 pronunciation catalog item (undefined for A1–A2 items and unknown IDs). */
export function monthlyPronunciationRule(itemId: string | undefined): MonthlyPronunciationRule | undefined {
  return itemId ? MONTHLY_PRONUNCIATION_RULES[itemId] : undefined;
}

/**
 * Rule of the roadmap item a lesson's pronunciation block teaches, resolved at
 * render time from the stored catalogId or the focus notation (unique inside a
 * level catalog), so lessons published before the rules existed show them too.
 * A1–A2 (phoneme and pair items) return undefined.
 */
export function monthlyPronunciationLessonRule(cefr: CefrLevel, target: { focus: string; catalogId?: string | undefined }): MonthlyPronunciationRule | undefined {
  if (monthlyPronunciationCatalogKey(cefr) === "A1A2") return undefined;
  const notation = target.focus.match(/\/[^/]+\//u)?.[0] ?? target.focus.trim();
  const item = findMonthlyPronunciationCatalogItem(cefr, { ipa: notation, ...(target.catalogId ? { catalogId: target.catalogId } : {}) });
  return item?.type === "phenomenon" ? monthlyPronunciationRule(item.id) : undefined;
}

export interface MonthlyPronunciationRuleCopy {
  rule: string;
  rememberLabel: string;
  remember: string;
  mistakeLabel: string;
  mistake: string;
  /** Rule core as a formula (pattern → result), when the item has one. */
  core?: { pattern: string; result: string; ending: "s" | "ed" };
}

/** The learner-facing rule block in the lesson language. */
export function monthlyPronunciationRuleCopy(rule: MonthlyPronunciationRule, language: "vi" | "en"): MonthlyPronunciationRuleCopy {
  return language === "en"
    ? { rule: rule.ruleEn, rememberLabel: "How to remember", remember: rule.rememberEn, mistakeLabel: "Common mistake", mistake: rule.mistakeEn, ...ruleCore(rule, rule.core?.patternEn) }
    : { rule: rule.ruleVi, rememberLabel: "Cách nhớ", remember: rule.rememberVi, mistakeLabel: "Lỗi hay gặp", mistake: rule.mistakeVi, ...ruleCore(rule, rule.core?.patternVi) };
}

function ruleCore(rule: MonthlyPronunciationRule, pattern: string | undefined): Pick<MonthlyPronunciationRuleCopy, "core"> {
  return rule.core && pattern ? { core: { pattern, result: rule.core.result, ending: rule.core.ending } } : {};
}
