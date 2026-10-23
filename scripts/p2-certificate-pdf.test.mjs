import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const certificateMarkup = `
  <main class="reward-page rw">
    <section class="cert-doc" aria-label="Chứng nhận hoàn thành">
      <header class="cert-head">
        <div><div class="cert-org">Season English</div><div class="xs muted">GFT · Chương trình tiếng Anh nội bộ</div></div>
        <div class="cert-no xs muted">Số: SE-2026-000001</div>
      </header>
      <div class="cert-body">
        <div class="eyebrow">Chứng nhận hoàn thành</div>
        <h1 class="cert-title">Certificate of Completion</h1>
        <p class="cert-line">Chứng nhận</p>
        <div class="cert-name">Nguyễn Minh Anh</div>
        <p class="cert-line">đã hoàn thành chương trình Season English với kết quả học tập được ghi nhận.</p>
        <div class="cert-facts">
          <div><span class="xs muted">Ngày hoàn thành</span><b>23/10/2026</b></div>
          <div><span class="xs muted">Huy hiệu</span><b>8/8</b></div>
          <div><span class="xs muted">Điểm tích luỹ</span><b>1.250</b></div>
          <div><span class="xs muted">Trình độ</span><b>B1</b></div>
        </div>
        <div class="cert-badges">
          ${Array.from({ length: 8 }, (_, index) => `<div class="cert-badge"><span class="ck">✓</span><div><b>Huy hiệu ${index + 1}</b><div class="xs muted">Minh chứng hoàn thành bền vững</div></div></div>`).join("")}
        </div>
      </div>
      <div class="cert-sign">
        <div><div class="line"></div><div>Vận hành</div><div class="xs muted">Nguyễn Vận Hành</div></div>
        <div class="cert-date xs muted">GFT, ngày 23 tháng 10 năm 2026</div>
        <div><div class="line"></div><div>Quản lý</div><div class="xs muted">Nguyễn Quản Lý</div></div>
      </div>
      <div class="cert-foot xs muted">Chứng nhận tự động từ dữ liệu Season English; có giá trị nội bộ.</div>
    </section>
  </main>`;

test("P2 certificate prints as one A4 landscape page", async () => {
  const css = await readFile(new URL("../apps/web/src/app/learner/learner.css", import.meta.url), "utf8");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      :root{--surface:#fff;--border:#6e3b32;--line:#d6ccbf;--primary:#f28c28;--text:#1e1e1e;--surface-3:#fff4d9;--ok-tint:#dce8c8;--olive-dark:#4b6120}
      *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.xs{font-size:.75rem}.muted{color:#6b6259}.eyebrow{text-transform:uppercase;font-size:.75rem;font-weight:700}
      ${css}
    </style></head><body>${certificateMarkup}</body></html>`, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", landscape: true, preferCSSPageSize: true, printBackground: true });
    const source = pdf.toString("latin1");
    const pages = source.match(/\/Type\s*\/Page\b/g) ?? [];
    assert.equal(pages.length, 1, `expected one PDF page, received ${pages.length}`);
    const mediaBox = source.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    assert.ok(mediaBox, "PDF must expose a MediaBox");
    assert.ok(Number(mediaBox[1]) > Number(mediaBox[2]), "PDF must be landscape");
  } finally {
    await browser.close();
  }
});
