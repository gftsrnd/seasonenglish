# Season English – Logic V2 (`logic-v2/useAppLogicV2.ts`)

Một file TypeScript duy nhất, headless (không HTML/CSS), trích toàn bộ business logic, state, AI calls và app flow từ `core.js`. App cũ (`index.html`, `core.js`, `style.css`) **không bị đụng tới**.

- Dùng chung schema localStorage `aec:v1` (và `aec:v1:sandbox`) → dữ liệu hiện có chạy được ngay với UI V2.
- Kiểm tra: TypeScript 5.6, `strict: true`, `noImplicitAny: false` → 0 lỗi. Smoke test runtime trên dữ liệu demo (học viên → vận hành → quản lý) chạy xuyên suốt.
- React: `import { useEffect, useMemo, useReducer } from 'react'` ở đầu file chỉ phục vụ hook `useAppLogicV2`; UI không dùng React thì xoá dòng đó và dùng `createAppLogicV2()`.

## Cách dùng

```ts
import { createAppLogicV2 } from './logic-v2/useAppLogicV2';           // framework-agnostic
const logic = createAppLogicV2();                                     // đọc localStorage, chạy migration, nhắc học
logic.subscribe(() => rerender());                                    // state đổi
logic.on('notify', (msg, type) => toast(msg, type));                  // thay cho toast() cũ
logic.on('celebrate', kind => fireworks());                           // badge / level / kỷ lục
const home = logic.select.learnerHome(logic.select.me()!);

// React
import useAppLogicV2 from './logic-v2/useAppLogicV2';
const { state, logic, select } = useAppLogicV2();
```

Quy ước: hàm có side effect trả về `{ ok: true, ... }` hoặc `{ error: 'thông báo tiếng Việt' }`; những thao tác cần xác nhận (xoá, nộp phần thi, nạp demo…) **UI tự confirm** rồi mới gọi.

## STATE (`logic.getState()` – `AppState`)

| Key | Nội dung |
|---|---|
| `settings` | AI provider/keys/model, webhook Base.vn, pilot (ngày bắt đầu, số tuần, ép tuần), PIN vai trò, prompts đã sửa, cấu hình test (giờ, số cảnh báo), ngưỡng lên/hạ mức, theme, chủ đề khoá, giới hạn chat/ngày, nguồn ảnh |
| `users` | Tài khoản 3 vai trò: mức CEFR, duyệt, hồ sơ, persona, avatar, PIN, lịch sử mức, mức chờ đổi, huy hiệu đã thông báo, strike chủ đề game |
| `weeks` | Khung chủ đề tuần (+ `plan` 5 ngày/mức từ gợi ý AI) |
| `lessonSets` | Bộ 5 bài/tuần/mức (draft/approved), mỗi bài 4 kỹ năng + từ vựng/ngữ pháp/phát âm + bài tập từ loại, dùng từ, bản dịch |
| `microLessons` | Bài siêu ngắn do học viên tự tạo |
| `practiceResults` | Kết quả từng phần bài tập (`userId_lessonId[~L/R/C/U/S/P]`): answer, attempts, ok, grade, audio, drilled |
| `progress`, `activity` | Bài hoàn thành; hoạt động theo ngày (streak, điểm danh, nhắc học) |
| `coachSessions` | Chat với Season (tuần âm = đã xoá chat; `challenge` = thử thách lên mức) |
| `submissions`, `surveys` | Bài thực hành cuối tuần (rubric, điểm, kháng nghị); khảo sát cuối pilot |
| `tests`, `testDrafts` | Bài thi đầu vào / cuối kỳ / lên mức; bản nháp theo `userId:kind` |
| `levelForms`, `levelRequests` | Đề lên mức (AI sinh, duyệt 1 đề/mức); yêu cầu lên mức chờ vận hành |
| `reminders`, `appeals`, `deleteRequests`, `trash`, `pinReports`, `topicReports` | Nhắc học; kháng nghị chấm; maker-checker xoá tài khoản + thùng rác; quên PIN; báo cáo chủ đề game |
| `gameSets`, `gameResults`, `duels` | Bộ từ mini game, kết quả, thách đấu 1-1 |
| `session` | `userId` đang đăng nhập, tab đọc mẫu |

## SELECTORS (`logic.select.*`) – dữ liệu thuần cho từng màn

| Nhóm | Hàm |
|---|---|
| Chung | `me`, `userById`, `learners`, `activeLearners`, `isStaff`, `canManage`, `currentWeek`, `weekInfo`, `weekStart`, `isLastWeek`, `courseTheme`, `theme`, `themeMarkSvg`, `autoTheme`, `avatarSpec`, `audio`, `ai.*` |
| Vào app | `entry()` → `empty / role / learner-login / staff-pick / in` |
| Học viên | `learnerHome(u)`, `lessonAccess(id)`, `lessonView(lesson, key)`, `practiceView(key)`, `coachView(u)`, `challengeView(u)`, `weeklyPractice(u)`, `profileRows(u)`, `rewards(u)`, `certificate(u, preview)`, `levelSignal(u)`, `levelUpState(u)`, `levelUpEligibility(u)`, `todayMicro(u)`, `mySurvey(u)`, `weekDots`, `streakDays`, `sessionsThisWeek`, `missedDays`, `vocabOf`, `vocabDetailsOf` |
| Vận hành | `approval()`, `levelForms()`, `weeks()`, `lessonMatrix()`, `lessonSet(week, cefr)`, `review(tab)`, `prompts()`, `settings()`, `testReview(testId)`, `userQuickView(userId)`, `pinOverview()`, `delReqView(viewer)`, `trashList()`, `goneRequests()` |
| Quản lý | `manager()`, `ops()`, `reminders()`, `report(author)`, `rewardSim()`, `kpis()`, `learnerRow(u)` |
| Game | `games(u)`, `gameIntro(game, set, duel?)`, `arena(u)`, `duel(id)`, `gameSets(u)`, `currentGameSet(u)`, `bestGame` |

## ACTIONS

| Nhóm | Hàm (tham số chính) |
|---|---|
| `auth` | `chooseRole(role)`, `learnerLogin(name, pin)`, `learnerRegister(name, pin, pin2)`, `staffLogin(userId, pin?)` → `{needPin}` khi cần PIN, `logout()`, `pinForgotSend(operatorId, note)` |
| `users` | `addUser(name, role)`, `setRole`, `resetPin`, `renameUser`, `saveAvatar(userId, {color, acc, bg})`, `requestDeleteUser(userId, reason?)` (quản lý xoá thẳng vào thùng rác; vận hành gửi yêu cầu), `cancelDeleteRequest`, `decideDeleteRequest(id, ok, note)`, `trashRestore`, `trashPurge`, `pinReportDone` |
| `profile` | `save(name, fields, persona)`, `saveDraft(fields)`, `validate`, `setPersona`, `opts` |
| `settings` | `save(patch)`, `setTheme`, `testAi()`, `testWebhook()`, `testImage()`, `clearImageCache`, `exportJSON`, `importJSON(file)`, `exportCSV`, `seedDemo()`, `wipe()` |
| `test` (TestEngine) | `canOpen(kind, u)`, `start(kind)`, `overview()`, `begin()`, `enterSection()`, `answer(key, v)`, `setText(key, t)`, `play(partKey)`, `attachAudio(key, file)`, `finishWarning()`, `finishSection()`, `summary()`, `submit()`, `integrityWarning(reason)`, `timeLeft`, `reset()`; sự kiện: `tick`, `countdown`, `warning`, `step`, `status`, `submitted`, `beep`, `alarm` |
| `lesson` | `markStudied(id)`, `submitPractice(key, answer)`, `attachAudio(key, file)`, `drill(id, word)`, `complete(id, opts)`, `ensureTrans(key)`, `appealPart(key, reason)`, `appealSubmission(subId, reason)`, `micro.generate / complete / delete` |
| `coach` | `send(text, {challenge})` → lượt + từ mở + kết quả thử thách, `clear()`, `setPersona` |
| `practice` / `survey` | `submit(text)`; `submit(rating, comment, when)` |
| `rewards` | `announce(u)` → huy hiệu/cấp mới; `sim.pick / points / toggle` |
| `operator` | Duyệt mức: `approveLevel`, `setLevelDirect`, `changeLevel`, `cancelPendingLevel`, `setMonthlyGoal`, `demote`, `rescoreTest`, `gradeTestManual` · Đề lên mức: `generateLevelForm`, `approveLevelForm`, `deleteLevelForm`, `approveLevelRequest`, `rejectLevelRequest` · Chủ đề: `suggestWeeks`, `confirmWeekSuggestion`, `closeWeekSuggestion`, `reopenWeekSuggestion`, `saveWeeks` · Bài học: `addLevelColumn`, `generateSet(week, cefr, onStatus)`, `createManualSet`, `approveSet`, `unapproveSet`, `deleteSet`, `deleteLessonAt`, `editLessonJson`, `lessonFormInitial`, `saveLessonForm(setId, day, fields, force)`, `enrichSet`, `fillPhrases` · Đọc mẫu: `setReviewTab`, `checkSubmission`, `checkTurn`, `gradeSubmissionAI`, `gradeSubmissionManual`, `decideAppeal`, `closeTopicReport` · `savePrompts` |
| `manager` | `reminderCopy / Dismiss / Send / SendAll`, `exportCSV`, `copyReport(u)`, `downloadReport(u)` |
| `games` | `makeSet(topic)`, `useWeekSet()`, `pickSet`, `deleteSet`, `validateTopic`, `finish(...)`, `newDuel(toId, game)`; engine thuần: `engines.scramble / crossword / catch / mario / sort / typing`; `art.src / hero / heroKind / item / list` |
| `platform` | `speech` (TTS, STT, `playSound`), `recorder` (ghi âm, `micCheck`), `audioStore` (IndexedDB), `audio` (BGM YouTube/ambience, SFX, 3 công tắc), `beep`, `alarm`, `buzz`, `vocabImage`, `takeAudio`, `copyText`, `download` |
| `ai` | `call`, `ping`, `assessPlacement`, `generateWeekLessons`, `generateLessonSet`, `generateMicroLesson`, `suggestWeeks`, `transcribe`, `gradeMicro`, `coachTurn`, `gradeSubmission`, `gameVocab`, `generateLevelForm`, `onStatus` |
| `consts` | `LEVELS`, `SECTIONS`, `PROFILE_OPTS`, `BADGES`, `GOOSE_LEVELS`, `DOC_FIELDS`, `PART_NAMES`, `THEMES`, `PERSONAS`, `GAME_LIST`, `PROMPT_KEYS`, `OAI_PRESETS`… |

## Sự kiện (`logic.on(event, fn)`)

`change` (state đổi) · `saved` · `notify(msg, type)` · `session` (đổi người dùng) · `celebrate(kind)` · `audio` · `trans-failed`.

## Phần UI V2 phải tự làm (cố ý để ngoài logic)

Render HTML, modal/confirm/prompt, toast, router (`next`/`redirect` trả về dạng đường dẫn `/home`, `/op`…), vẽ canvas cho Season catch / Season-rio (engine cung cấp thiết kế màn, luật, điểm), pháo hoa, in chứng nhận (`window.print`), gắn `visibilitychange/blur` vào `test.integrityWarning` (đã làm sẵn khi `attachToDocument` = true).
