import { containsVietnameseLearnerText } from "@e4s/domain/content";

export type LearnerLessonLanguage = "vi" | "en";

export function learnerLessonLanguageForCefr(cefr: string): LearnerLessonLanguage {
  return cefr === "B1" || cefr === "B2" || cefr === "C1" ? "en" : "vi";
}

export function lessonGuidanceMatchesLanguage(value: string, language: LearnerLessonLanguage): boolean {
  const hasVietnamese = containsVietnameseLearnerText(value);
  return language === "vi" ? hasVietnamese : !hasVietnamese;
}

export function lessonGuidanceOrFallback(value: string | undefined, language: LearnerLessonLanguage, fallback: string): string {
  const normalized = value?.replace(/\s+/gu, " ").trim() ?? "";
  return normalized && lessonGuidanceMatchesLanguage(normalized, language) ? normalized : fallback;
}

export interface LearnerLessonCopy {
  objectiveHeading: string;
  objectiveAria: string;
  instructionHeading: string;
  instructionAria: string;
  vocabularyHeading: string;
  grammarHeading: string;
  pronunciationHeading: string;
  lessonAria: string;
  tabsAria: string;
  studyTab: string;
  practiceTab: string;
  studyDoneAria: string;
  practiceLockedTitle: string;
  answerLabel: string;
  multipleChoiceLabel: string;
  answerAria: (partCode: string) => string;
  hintLabel: string;
  answerRevealLabel: string;
  translationHeading: string;
  translationQuestionLabel: string;
  translationAnswerLabel: string;
  practiceGuideAria: string;
  speakingInstructionLabel: string;
  errors: {
    missingSpeakingEvidence: string;
    saveAnswer: string;
    appeal: string;
    study: string;
    completeLesson: string;
    noAudio: string;
    audioFailed: string;
    savedAudioFailed: string;
    invalidAudio: string;
    audioTooLarge: string;
    uploadFailed: string;
    recorderUnavailable: string;
    recordingInterrupted: string;
    microphoneUnavailable: string;
  };
  notices: {
    speakingGate: string;
    uploadReady: string;
    uploadBusy: string;
    savedAudioBusy: string;
    retryAudio: string;
    retrySavedAudio: string;
    retryUpload: string;
  };
  buttons: {
    retry: string;
    stopRecording: string;
    record: string;
    upload: string;
    checking: string;
    submit: string;
    completed: string;
    studyDone: string;
    moveToPractice: string;
    finishLesson: string;
    saveReview: string;
    sendAppeal: string;
    cancel: string;
  };
  status: {
    wrongRetry: string;
    submitted: string;
    wrongExhausted: string;
    translated: string;
    appealed: string;
    correct: string;
    unanswered: string;
  };
  vocabularyPartOfSpeech: (value: string | undefined, word: string) => string;
  vocabulary: {
    collocations: string;
    examples: string;
    relations: string;
    wordFamily: string;
    umbrellaWord: string;
    currentAndRelated: string;
    meaningUnavailable: string;
  };
  modal: {
    family: string;
    synonyms: string;
    antonyms: string;
    umbrella: string;
    lexical: string;
    close: string;
    listen: string;
    definition: string;
    example: string;
    context: string;
    note: string;
    source: string;
  };
}

const vietnamesePartOfSpeech: Record<string, string> = {
  noun: "danh từ", verb: "động từ", adjective: "tính từ", adverb: "trạng từ",
  preposition: "giới từ", phrase: "cụm từ", pronoun: "đại từ", conjunction: "liên từ"
};

const knownVietnamesePartOfSpeech: Record<string, string> = {
  good: "tính từ", bad: "tính từ", fine: "tính từ", clear: "tính từ",
  job: "danh từ", slide: "danh từ", thank: "động từ", check: "động từ",
  send: "động từ", help: "động từ", finish: "động từ"
};

const knownEnglishPartOfSpeech: Record<string, string> = {
  good: "adjective", bad: "adjective", fine: "adjective", clear: "adjective",
  job: "noun", slide: "noun", thank: "verb", check: "verb",
  send: "verb", help: "verb", finish: "verb"
};

export const learnerLessonCopy: Record<LearnerLessonLanguage, LearnerLessonCopy> = {
  vi: {
    objectiveHeading: "MỤC TIÊU BÀI HỌC",
    objectiveAria: "Mục tiêu bài học",
    instructionHeading: "HƯỚNG DẪN LÀM BÀI",
    instructionAria: "Hướng dẫn thực hiện",
    vocabularyHeading: "TỪ VỰNG",
    grammarHeading: "NGỮ PHÁP",
    pronunciationHeading: "PHÁT ÂM",
    lessonAria: "Bài học",
    tabsAria: "Các bước trong bài học",
    studyTab: "Học",
    practiceTab: "Bài tập",
    studyDoneAria: "Đã học",
    practiceLockedTitle: "Bấm Đã học xong ở bước Học trước",
    answerLabel: "Bài làm của bạn",
    multipleChoiceLabel: "trắc nghiệm",
    answerAria: (partCode) => `Câu trả lời ${partCode}`,
    hintLabel: "Gợi ý",
    answerRevealLabel: "Đáp án",
    translationHeading: "Bản dịch tiếng Việt",
    translationQuestionLabel: "Câu hỏi",
    translationAnswerLabel: "Đáp án",
    practiceGuideAria: "Hướng dẫn thực hiện",
    speakingInstructionLabel: "Yêu cầu:",
    errors: {
      missingSpeakingEvidence: "Hãy ghi âm hoặc tải file ghi âm lên trước khi kiểm tra phần Nói.",
      saveAnswer: "Chưa lưu được câu trả lời. Dữ liệu trên màn hình vẫn được giữ để bạn thử lại.",
      appeal: "Chưa gửi được kháng nghị. Bạn có thể thử lại.",
      study: "Chưa ghi nhận được phần Học. Nội dung vẫn được giữ để bạn thử lại.",
      completeLesson: "Chưa ghi nhận được bài học. Nội dung vẫn được giữ để bạn thử lại.",
      noAudio: "Chưa có nội dung âm thanh cho phần Nghe.",
      audioFailed: "Không phát được file âm thanh. Bạn có thể thử lại.",
      savedAudioFailed: "Không tải được bản ghi âm đã lưu. Bạn có thể thử lại.",
      invalidAudio: "Hãy chọn file âm thanh (mp3, m4a, wav, webm…).",
      audioTooLarge: "File quá lớn (tối đa 20 MB). Bạn có thể chọn file khác rồi thử lại.",
      uploadFailed: "Không tải được file ghi âm. Bạn có thể thử lại.",
      recorderUnavailable: "Trình duyệt này không ghi âm được: bạn sẽ nộp phần Nói bằng cách tải file lên.",
      recordingInterrupted: "Ghi âm bị gián đoạn. Bạn có thể thử lại hoặc tải file lên.",
      microphoneUnavailable: "Không dùng được micro – hãy tải file ghi âm lên."
    },
    notices: {
      speakingGate: "Nghe đủ 3 từ mẫu phát âm ở bước Học để mở phần kiểm tra Nói.",
      uploadReady: "Đã tải file ghi âm lên. Bấm Kiểm tra Nói để nộp.",
      uploadBusy: "Đang tải file ghi âm…",
      savedAudioBusy: "Đang tải bản ghi âm đã lưu…",
      retryAudio: "Thử lại audio",
      retrySavedAudio: "Thử lại nghe bản ghi",
      retryUpload: "Thử lại tải file"
    },
    buttons: {
      retry: "Thử lại", stopRecording: "Dừng ghi", record: "Ghi âm", upload: "Tải file ghi âm",
      checking: "Đang lưu…", submit: "Nộp bài", completed: "Đã xong", studyDone: "Đã học xong → Làm bài tập",
      moveToPractice: "Sang bài tập →", finishLesson: "Hoàn thành bài", saveReview: "Lưu lần ôn này",
      sendAppeal: "Xác nhận gửi kháng nghị", cancel: "Huỷ"
    },
    status: {
      wrongRetry: "Chưa đúng · còn lượt thử", submitted: "Đã gửi để kiểm tra", wrongExhausted: "Đã hết lượt thử",
      translated: "Đã xem bản dịch", appealed: "Đã gửi kháng nghị", correct: "Đúng", unanswered: "Chưa trả lời"
    },
    vocabularyPartOfSpeech: (value, word) => {
      const normalized = value?.trim().toLocaleLowerCase() ?? "";
      return vietnamesePartOfSpeech[normalized] ?? (normalized || knownVietnamesePartOfSpeech[word.trim().toLocaleLowerCase()] || "từ");
    },
    vocabulary: {
      collocations: "Cụm từ thường dùng", examples: "Ví dụ", relations: "Các nhóm từ liên quan",
      wordFamily: "Họ từ", umbrellaWord: "Từ bao trùm", currentAndRelated: "Từ hiện tại và các từ cùng nhóm",
      meaningUnavailable: "Chưa có dữ liệu từ liên quan cho từ này."
    },
    modal: {
      family: "Họ từ", synonyms: "Đồng nghĩa", antonyms: "Trái nghĩa", umbrella: "Từ bao quát", lexical: "Từ liên quan",
      close: "Đóng", listen: "Nghe", definition: "Định nghĩa", example: "Ví dụ", context: "Ngữ cảnh", note: "Ghi chú", source: "Nguồn"
    }
  },
  en: {
    objectiveHeading: "LESSON OBJECTIVES",
    objectiveAria: "Lesson objectives",
    instructionHeading: "INSTRUCTIONS",
    instructionAria: "Instructions",
    vocabularyHeading: "VOCABULARY",
    grammarHeading: "GRAMMAR",
    pronunciationHeading: "PRONUNCIATION",
    lessonAria: "Lesson",
    tabsAria: "Lesson steps",
    studyTab: "Study",
    practiceTab: "Practice",
    studyDoneAria: "Completed",
    practiceLockedTitle: "Complete the Study step first",
    answerLabel: "Your answer",
    multipleChoiceLabel: "multiple choice",
    answerAria: (partCode) => `Answer for ${partCode}`,
    hintLabel: "Hint",
    answerRevealLabel: "Answer",
    translationHeading: "Answer explanation",
    translationQuestionLabel: "Question",
    translationAnswerLabel: "Answer",
    practiceGuideAria: "Instructions",
    speakingInstructionLabel: "Task:",
    errors: {
      missingSpeakingEvidence: "Record or upload your speaking answer before checking it.",
      saveAnswer: "We could not save your answer. Your input is still here so you can try again.",
      appeal: "We could not submit the appeal. You can try again.",
      study: "We could not save the Study step. The content is still here so you can try again.",
      completeLesson: "We could not save the lesson. The content is still here so you can try again.",
      noAudio: "No audio content is available for this Listening section.",
      audioFailed: "The audio file could not be played. You can try again.",
      savedAudioFailed: "The saved recording could not be loaded. You can try again.",
      invalidAudio: "Choose an audio file (mp3, m4a, wav or webm).",
      audioTooLarge: "The file is too large (20 MB maximum). Choose another file and try again.",
      uploadFailed: "The recording could not be uploaded. You can try again.",
      recorderUnavailable: "This browser cannot record audio. Submit Speaking by uploading a file.",
      recordingInterrupted: "The recording was interrupted. Try again or upload a file.",
      microphoneUnavailable: "The microphone is unavailable. Upload a recording instead."
    },
    notices: {
      speakingGate: "Listen to all three model pronunciation words in Study to unlock Speaking.",
      uploadReady: "Your recording is uploaded. Select Check speaking to submit it.",
      uploadBusy: "Uploading the recording…",
      savedAudioBusy: "Loading the saved recording…",
      retryAudio: "Retry audio",
      retrySavedAudio: "Retry saved recording",
      retryUpload: "Retry upload"
    },
    buttons: {
      retry: "Retry", stopRecording: "Stop recording", record: "Record", upload: "Upload recording",
      checking: "Saving…", submit: "Submit", completed: "Completed", studyDone: "Study complete → Practice",
      moveToPractice: "Go to Practice →", finishLesson: "Complete lesson", saveReview: "Save review",
      sendAppeal: "Submit appeal", cancel: "Cancel"
    },
    status: {
      wrongRetry: "Incorrect · try again", submitted: "Submitted for review", wrongExhausted: "No attempts left",
      translated: "Translation opened", appealed: "Appeal submitted", correct: "Correct", unanswered: "Not answered"
    },
    vocabularyPartOfSpeech: (value, word) => {
      const normalized = value?.trim().toLocaleLowerCase() ?? "";
      return normalized && Object.prototype.hasOwnProperty.call(vietnamesePartOfSpeech, normalized)
        ? normalized
        : knownEnglishPartOfSpeech[word.trim().toLocaleLowerCase()] ?? "word";
    },
    vocabulary: {
      collocations: "Common collocations", examples: "Examples", relations: "Related word groups",
      wordFamily: "Word family", umbrellaWord: "Umbrella word", currentAndRelated: "Current and related words",
      meaningUnavailable: "No related-word data is available for this word."
    },
    modal: {
      family: "Word family", synonyms: "Synonyms", antonyms: "Antonyms", umbrella: "Umbrella word", lexical: "Related words",
      close: "Close", listen: "Listen", definition: "Definition", example: "Example", context: "Context", note: "Note", source: "Source"
    }
  }
};

export function lessonCopyForCefr(cefr: string): LearnerLessonCopy {
  return learnerLessonCopy[learnerLessonLanguageForCefr(cefr)];
}
