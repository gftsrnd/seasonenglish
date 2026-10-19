import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const matrixRelativePath = "docs/app-parity/route-state-matrix.md";
const matrixPath = resolve(repoRoot, matrixRelativePath);
const jsonPath = resolve(repoRoot, "docs/app-parity/parity-ledger.json");
const markdownPath = resolve(repoRoot, "docs/app-parity/parity-ledger.md");
const matrix = readFileSync(matrixPath, "utf8");

const validPrefixes = [
  "shell.", "route.", "root.", "settings.", "op.", "levelforms.", "slot.", "weeks.",
  "lessons.", "cell.", "lesson-set.", "lesson.", "review.", "prompts.", "mgr", "reminders.",
  "report.", "reward-sim.", "home.", "onboard.", "test.", "micro.", "coach.", "challenge.",
  "practice.", "survey.", "profile.", "reward.", "games.", "game.", "arena.", "duel.",
  "modal.", "overlay."
];

const missingContractPrefixes = [];

// The API/persistence and UI gaps in the 15/10 baseline have now been
// implemented. They deliberately remain `missing_evidence` until the final
// automated + browser proof pass; implementation progress and verification
// progress are reported separately below.
const missingApiPrefixes = [];
const missingUiPrefixes = [];

const blockerPrefixes = [
  "test.timer.",
  "test.anti-cheat.",
  "test.device.",
  "test.submit.",
  "op.tests.",
  "op.level-flow.",
  "lesson-set.",
  "settings.ai-provider."
];

function cleanMarkdown(value) {
  return value
    .replaceAll("<br>", "; ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function expandStateToken(token) {
  const braces = token.match(/\{([^{}]+)\}/);
  if (braces) {
    return braces[1]
      .split(",")
      .flatMap((choice) => expandStateToken(token.replace(braces[0], choice.trim())));
  }

  const numericRange = token.match(/^(.*\.)(\d+)\.\.(\d+)$/);
  if (numericRange) {
    const [, prefix, fromText, toText] = numericRange;
    const from = Number(fromText);
    const to = Number(toText);
    return Array.from({ length: to - from + 1 }, (_, offset) => `${prefix}${from + offset}`);
  }

  return [token];
}

function isStateToken(token) {
  return validPrefixes.some((prefix) => token.startsWith(prefix));
}

function extractStateTokens(value) {
  const tokens = [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  return tokens.filter(isStateToken).flatMap(expandStateToken);
}

function roleForSection(section) {
  if (section.startsWith("Operator")) return "Operator";
  if (section.startsWith("Manager")) return "Manager";
  if (section.startsWith("Learner")) return "Learner";
  return "Shared";
}

function roleForDirectState(id, trigger, fallbackRole) {
  const value = `${id} ${trigger}`.toLowerCase();
  if (value.includes("#/op") || value.includes("operator")) return "Operator";
  if (value.includes("manager")) return "Manager";
  if (
    value.includes("test-auto") ||
    value.includes("anti-cheat") ||
    value.includes("lesson vocabulary") ||
    value.includes("vocab-") ||
    value.includes("practice") ||
    value.includes("learner") ||
    value.includes("home/")
  ) return "Learner";
  return fallbackRole;
}

function specificCondition(rawCondition, id) {
  const parts = rawCondition.split(/<br>|\n/).map((part) => part.trim()).filter(Boolean);
  const match = parts.find((part) => extractStateTokens(part).includes(id));
  return cleanMarkdown(match ?? rawCondition);
}

function hasPrefix(id, prefixes) {
  return prefixes.some((prefix) => id.startsWith(prefix));
}

function classify(id) {
  if (hasPrefix(id, missingContractPrefixes)) return "missing_contract";
  if (hasPrefix(id, missingApiPrefixes)) return "missing_api";
  if (hasPrefix(id, missingUiPrefixes)) return "missing_ui";
  return "missing_evidence";
}

function proofFor(role) {
  if (role === "Learner") return "Chưa có — cần test contract/API/UI cho trạng thái người học này.";
  if (role === "Operator") return "Chưa có — cần test quyền Operator và mutation/API tương ứng.";
  if (role === "Manager") return "Chưa có — cần test quyền Manager, dữ liệu thật và tác vụ quản trị.";
  return "Chưa có — cần test guard, shell hoặc modal dùng chung.";
}

const recordsById = new Map();
let section = "Shared";

function addRecord({ id, route, role, condition }) {
  if (recordsById.has(id)) return;
  const status = classify(id);
  recordsById.set(id, {
    id,
    route,
    role,
    condition: cleanMarkdown(condition) || id,
    sourceAnchor: `research/seasonenglish/core.js#route:${route}|state:${id}`,
    contract: status === "missing_contract" ? "Thiếu contract biểu diễn đầy đủ trạng thái này." : "Cần đối chiếu contract hiện có với app.",
    api: status === "missing_api" ? "Thiếu hoặc chưa hoàn thiện endpoint/persistence cho trạng thái này." : "Cần kiểm chứng bằng response và dữ liệu lưu thực tế.",
    ui: status === "missing_ui" ? "Thiếu nhánh UI hoặc modal tương ứng trong bản React." : "Cần đối chiếu trực quan với app gốc.",
    automatedProof: proofFor(role),
    browserEvidence: "Chưa có — cần ảnh chụp đúng route, vai trò và fixture sau khi test tự động đạt.",
    blocker: hasPrefix(id, blockerPrefixes),
    owner: "Minh",
    status
  });
}

for (const line of matrix.split(/\r?\n/)) {
  const heading = line.match(/^## (.+)$/);
  if (heading) {
    section = heading[1];
    continue;
  }
  if (!line.startsWith("|") || /^\|[-\s|]+\|$/.test(line)) continue;

  const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
  if (cells.length < 3 || cells[0] === "State ID" || cells[0] === "Route" || cells[0] === "Modal ID") continue;

  const firstCode = cells[0].match(/`([^`]+)`/)?.[1];
  const role = roleForSection(section);

  if (firstCode?.startsWith("#/")) {
    const condition = cells[2] ?? cells[1];
    for (const id of extractStateTokens(condition)) {
      addRecord({ id, route: firstCode, role, condition: specificCondition(condition, id) });
    }
    if (firstCode === "#/test/:kind") {
      for (const id of ["test.section.reading", "test.section.writing", "test.section.speaking"]) {
        addRecord({ id, route: firstCode, role, condition: "Bốn section theo thứ tự Listening, Reading, Writing, Speaking." });
      }
    }
    continue;
  }

  if (firstCode && isStateToken(firstCode)) {
    for (const id of expandStateToken(firstCode)) {
      const route = id.startsWith("modal.") || id.startsWith("overlay.") ? cleanMarkdown(cells[1]) : "global";
      addRecord({ id, route, role: roleForDirectState(id, route, role), condition: cells[1] });
    }
  }
}

const records = [...recordsById.values()].sort((left, right) => {
  const roleOrder = ["Shared", "Learner", "Operator", "Manager"];
  return roleOrder.indexOf(left.role) - roleOrder.indexOf(right.role) || left.route.localeCompare(right.route) || left.id.localeCompare(right.id);
});

const approvedExceptions = new Set([
  "root.empty-system",
  "root.role-choice",
  "root.learner-login",
  "root.operator-picker",
  "root.manager-picker"
]);

for (const record of records) {
  if (!approvedExceptions.has(record.id)) continue;
  record.contract = "Ngoại lệ đã được Minh–Thư chốt: dùng đăng nhập và phân quyền thật thay cho bộ chọn vai trò/tài khoản của app.";
  record.api = "Identity API và session thật thay thế local demo users/PIN của app.";
  record.ui = "Màn đăng nhập thật được phép khác app; không được dùng lại ba lựa chọn đăng nhập demo.";
  record.automatedProof = "Được kiểm tra trong identity/session và role-guard tests.";
  record.browserEvidence = "evidence/parity/auth-root/local-auth-root-2026-10-15.png; evidence/parity/auth-root/app-role-choice-2026-10-15.png";
  record.blocker = false;
  record.status = "approved_exception";
}

// Evidence is promoted state-by-state. Keeping these paths beside the
// generator prevents a regenerated ledger from reverting verified progress to
// 0/434 while still refusing to treat an entire route as proven by one image.
const verifiedEvidence = {
  "shell.guest": {
    automatedProof: "apps/web/test/entry-screen.test.tsx",
    browserEvidence: "evidence/parity/auth-root/local-auth-root-2026-10-15.png; evidence/parity/auth-root/app-role-choice-2026-10-15.png"
  },
  "op.learners.populated": {
    automatedProof: "apps/web/test/operator-assessment-screens.test.tsx; apps/web/src/app/operator/operator-app.test.tsx; apps/api/test/operator-learner-operations.integration.test.ts",
    browserEvidence: "evidence/parity/operator-root/local-operator-root-2026-10-15.png; evidence/parity/operator-root/app-operator-root-2026-10-15.png"
  },
  "op.level-flow.approved": {
    automatedProof: "apps/web/test/operator-assessment-screens.test.tsx; apps/api/test/assessment.integration.test.ts",
    browserEvidence: "evidence/parity/operator-root/local-operator-root-2026-10-15.png; evidence/parity/operator-root/app-operator-root-2026-10-15.png"
  },
  "op.level-signal.none": {
    automatedProof: "apps/web/test/operator-assessment-screens.test.tsx",
    browserEvidence: "evidence/parity/operator-root/local-operator-root-2026-10-15.png; evidence/parity/operator-root/app-operator-root-2026-10-15.png"
  },
  "op.tests.none": {
    automatedProof: "apps/web/test/operator-assessment-screens.test.tsx; apps/web/src/app/operator/operator-app.test.tsx",
    browserEvidence: "evidence/parity/operator-root/local-operator-root-2026-10-15.png; evidence/parity/operator-root/app-operator-root-2026-10-15.png"
  },
  "weeks.complete": {
    automatedProof: "apps/web/src/app/operator/OperatorRouteController.test.tsx; apps/web/test/operator-content-screens.test.tsx; apps/web/src/pages/operator/Weeks.app.test.tsx; apps/api/test/content.integration.test.ts",
    browserEvidence: "evidence/parity/operator-weeks/local-weeks-complete-2026-10-15.png; evidence/parity/operator-weeks/app-weeks-complete-2026-10-15.png"
  },
  "weeks.save.idle": {
    automatedProof: "apps/web/src/app/operator/OperatorRouteController.test.tsx; apps/web/test/operator-content-screens.test.tsx",
    browserEvidence: "evidence/parity/operator-weeks/local-weeks-complete-2026-10-15.png; evidence/parity/operator-weeks/app-weeks-complete-2026-10-15.png"
  }
};

for (const record of records) {
  const evidence = verifiedEvidence[record.id];
  if (!evidence) continue;
  record.automatedProof = evidence.automatedProof;
  record.browserEvidence = evidence.browserEvidence;
  record.status = "complete";
}

const count = (status) => records.filter((record) => record.status === status).length;
const ledger = {
  generatedFrom: matrixRelativePath,
  sourceSha256: createHash("sha256").update(matrix).digest("hex"),
  classificationRule: "Không có state nào được coi là complete nếu chưa có cả test tự động và browser evidence.",
  records,
  summary: {
    total: records.length,
    blocked: records.filter((record) => record.blocker).length,
    inScope: records.filter((record) => record.status !== "approved_exception").length,
    approvedExceptions: records.filter((record) => record.status === "approved_exception").length,
    implementationComplete: records.filter((record) => record.status === "missing_evidence" || record.status === "complete").length,
    implementationIncomplete: records.filter((record) => ["missing_contract", "missing_api", "missing_ui"].includes(record.status)).length,
    missingContract: count("missing_contract"),
    missingApi: count("missing_api"),
    missingUi: count("missing_ui"),
    missingEvidence: count("missing_evidence"),
    complete: count("complete")
  }
};

writeFileSync(jsonPath, `${JSON.stringify(ledger, null, 2)}\n`);

const statusLabel = {
  complete: "Đã kiểm chứng",
  approved_exception: "Ngoại lệ đã duyệt",
  missing_contract: "Thiếu contract",
  missing_api: "Thiếu API/persistence",
  missing_ui: "Thiếu UI",
  missing_evidence: "Chưa đủ evidence"
};

const markdown = [
  "# Bảng đối chiếu app và hệ thống hiện tại",
  "",
  `Nguồn chuẩn: \`${matrixRelativePath}\` và app thật trong \`research/seasonenglish/\`.`,
  "",
  "Không state nào được ghi hoàn thành chỉ vì đã có code. Một state chỉ được chuyển sang **Đã kiểm chứng** sau khi có cả test tự động và ảnh browser đúng vai trò/dữ liệu.",
  "",
  "## Tổng quan nền",
  "",
  "| Tổng state | Trong phạm vi parity | Ngoại lệ đã duyệt | Đã triển khai | Còn thiếu implementation | Chặn sử dụng | Thiếu contract | Thiếu API/persistence | Thiếu UI | Chờ evidence | Đã kiểm chứng đủ |",
  "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  `| ${ledger.summary.total} | ${ledger.summary.inScope} | ${ledger.summary.approvedExceptions} | ${ledger.summary.implementationComplete} | ${ledger.summary.implementationIncomplete} | ${ledger.summary.blocked} | ${ledger.summary.missingContract} | ${ledger.summary.missingApi} | ${ledger.summary.missingUi} | ${ledger.summary.missingEvidence} | ${ledger.summary.complete} |`,
  ""
];

for (const role of ["Shared", "Learner", "Operator", "Manager"]) {
  markdown.push(`## ${role}`, "", "| Màn/route | Trạng thái cần có | Điều kiện xuất hiện | Hiện trạng | Chặn dùng | Người xử lý | Evidence cần bổ sung |", "|---|---|---|---|:---:|---|---|");
  for (const record of records.filter((item) => item.role === role)) {
    const condition = record.condition.replaceAll("|", "\\|");
    markdown.push(`| \`${record.route}\` | \`${record.id}\` | ${condition} | ${statusLabel[record.status]} | ${record.blocker ? "Có" : "Không"} | ${record.owner} | ${record.browserEvidence} |`);
  }
  markdown.push("");
}

writeFileSync(markdownPath, `${markdown.join("\n")}\n`);
console.log(JSON.stringify(ledger.summary));
