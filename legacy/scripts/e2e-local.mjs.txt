import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createServer } from "node:net";

const root = process.cwd();
// The canonical local application runs on 4175. Keep one URL for both an
// already-running stack and the stack started by this harness so an E2E run
// cannot silently validate a stale server on another port.
const defaultWebUrl = "http://127.0.0.1:4175";
const localStackWebUrl = defaultWebUrl;
const explicitWebUrl = process.env.E4S_E2E_WEB_URL ?? process.env.E4S_WEB_URL;
const explicitApiUrl = process.env.E4S_E2E_API_URL ?? process.env.E4S_API_URL;
const shouldStartLocal = process.env.E4S_E2E_START !== "false";
const startupTimeoutMs = Number(process.env.E4S_E2E_STARTUP_TIMEOUT_MS ?? 120_000);
const freshScreenshotPath = process.env.E4S_E2E_SCREENSHOT_PATH
  ?? join(root, ".tmp", "evidence", "e2e-local", "e2e-post-patch-390.png");
const demoManagerId = "00000000-0000-4000-8000-000000000103";
const localRoleFixtures = [
  { label: "learner", email: "minh.anh.nguyen@e4s.local", password: "learner-pass", audience: "learner", role: "learner" },
  { label: "operator", email: "thu.ha.tran@e4s.local", password: "staff-pass", audience: "staff", role: "operator" },
  { label: "manager", email: "quoc.bao.le@e4s.local", password: "manager-pass", audience: "staff", role: "manager" }
];

let localProcess;
let chromeProcess;
let chromeProfile;
let page;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function fetchOk(url, timeoutMs = 1_500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForUrl(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fetchOk(url)) return;
    await sleep(250);
  }
  fail(`${label} did not become ready: ${url}`);
}

async function findAvailableWebUrl() {
  if (explicitWebUrl) {
    await waitForUrl(explicitWebUrl, startupTimeoutMs, "configured E4S web");
    return explicitWebUrl;
  }
  if (await fetchOk(defaultWebUrl)) return defaultWebUrl;
  if (!shouldStartLocal) {
    fail(`E4S web is not reachable at ${defaultWebUrl}; start local services or set E4S_E2E_WEB_URL`);
  }
  if (await fetchOk(localStackWebUrl)) return localStackWebUrl;
  localProcess = spawnLocalStack();
  await waitForUrl(localStackWebUrl, startupTimeoutMs, "local E4S web");
  return localStackWebUrl;
}

function resolveApiUrl(webUrl) {
  if (explicitApiUrl) return explicitApiUrl;
  const port = new URL(webUrl).port;
  if (port === "4173" || port === "4175") return "http://127.0.0.1:3001";
  if (port === "4174") return "http://127.0.0.1:3002";
  fail(`Cannot infer E4S API URL for ${webUrl}; set E4S_E2E_API_URL or E4S_API_URL`);
}

async function checkLocalApi(apiUrl) {
  const path = "/api/health";
  await waitForUrl(`${apiUrl}${path}`, startupTimeoutMs, "local E4S API health");
  const response = await fetch(`${apiUrl}${path}`);
  assert(response.ok, `Local E4S API health failed: ${response.status} ${apiUrl}${path}`);
  const payload = await response.json();
  assert(payload.status === "ok", `Local E4S API health returned ${JSON.stringify(payload)}, expected status ok`);
  console.log(`ok local API: health is ok at ${apiUrl}`);
}

async function checkLocalRoleFixtures(apiUrl) {
  for (const fixture of localRoleFixtures) {
    const login = await fetch(`${apiUrl}/api/auth/${fixture.audience}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: fixture.email, password: fixture.password })
    });
    const payload = await login.json().catch(() => ({}));
    assert(login.ok && payload.role === fixture.role,
      `Local ${fixture.label} fixture login failed: ${login.status} ${JSON.stringify(payload)}`);
    const setCookie = login.headers.get("set-cookie") ?? "";
    assert(/HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie),
      `Local ${fixture.label} session cookie is missing HttpOnly/SameSite=Lax attributes`);
    const cookie = setCookie.split(";")[0] ?? "";
    assert(cookie.startsWith("e4s_session="), `Local ${fixture.label} login did not issue the e4s_session cookie`);

    const session = await fetch(`${apiUrl}/api/session`, { headers: { cookie } });
    const sessionPayload = await session.json().catch(() => ({}));
    assert(session.ok && sessionPayload.role === fixture.role,
      `Local ${fixture.label} session bootstrap failed: ${session.status} ${JSON.stringify(sessionPayload)}`);

    const logout = await fetch(`${apiUrl}/api/logout`, { method: "POST", headers: { cookie } });
    assert(logout.status === 204, `Local ${fixture.label} logout failed: ${logout.status}`);
    const revoked = await fetch(`${apiUrl}/api/session`, { headers: { cookie } });
    assert(revoked.status === 401, `Local ${fixture.label} revoked session remained active: ${revoked.status}`);
    console.log(`ok local fixture: ${fixture.label} login, cookie/session bootstrap and revoke`);
  }

  for (const [label, audience, email, password] of [
    ["learner-at-staff", "staff", "minh.anh.nguyen@e4s.local", "learner-pass"],
    ["operator-at-learner", "learner", "thu.ha.tran@e4s.local", "staff-pass"]
  ]) {
    const response = await fetch(`${apiUrl}/api/auth/${audience}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const payload = await response.json().catch(() => ({}));
    assert(response.status === 403 && payload.code === "WRONG_LOGIN_PATH",
      `Wrong-audience login ${label} was not denied: ${response.status} ${JSON.stringify(payload)}`);
  }
  console.log("ok local fixture guards: wrong-audience role login is denied");
}

function spawnLocalStack() {
  const windows = process.platform === "win32";
  const command = windows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
  const args = windows ? ["/d", "/s", "/c", "pnpm dev:local"] : ["dev:local"];
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  const capture = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-12_000);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  child.on("error", (error) => {
    output = `${output}\n${error.stack ?? error.message}`.slice(-12_000);
  });
  child.e4sOutput = () => output;
  return child;
}

function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* already stopped */ }
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : undefined;
  await new Promise((resolve) => server.close(resolve));
  assert(port, "Could not allocate a local debugging port");
  return port;
}

function chromeCandidates() {
  const candidates = [
    process.env.E4S_E2E_CHROME,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  return candidates.filter(Boolean);
}

function findChrome() {
  const executable = chromeCandidates().find((candidate) => existsSync(candidate));
  if (!executable) fail("Chrome/Chromium not found. Set E4S_E2E_CHROME to the browser executable.");
  return executable;
}

async function launchChrome(startUrl) {
  const executable = findChrome();
  const port = await freePort();
  chromeProfile = await mkdtemp(join(tmpdir(), "e4s-e2e-profile-"));
  chromeProcess = spawn(executable, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${chromeProfile}`,
    startUrl
  ], { stdio: ["ignore", "ignore", "pipe"] });

  await waitForUrl(`http://127.0.0.1:${port}/json/version`, 20_000, "headless Chrome");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  assert(target?.webSocketDebuggerUrl, "Headless Chrome did not expose a page target");
  const cdpPage = new CdpPage(target.webSocketDebuggerUrl);
  await cdpPage.ready();
  return cdpPage;
}

class CdpPage {
  constructor(url) {
    this.nextId = 0;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.open = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(`${message.error.message} (${message.error.code})`));
      else request.resolve(message.result);
    });
    this.socket.addEventListener("close", () => {
      for (const request of this.pending.values()) request.reject(new Error("CDP connection closed"));
      this.pending.clear();
    });
  }

  async ready() {
    await this.open;
    await this.send("Runtime.enable");
    await this.send("Page.enable");
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (response.exceptionDetails) {
      const description = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
      throw new Error(`Browser evaluation failed: ${description}`);
    }
    return response.result?.value;
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
    await this.waitFor("document readiness", "document.readyState === 'complete'", 30_000);
  }

  async captureScreenshot(path, width = 390, height = 844) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true
    });
    const result = await this.send("Page.captureScreenshot", { format: "png" });
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, result.data, "base64");
  }

  async waitFor(label, expression, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(expression)) return;
      } catch (error) {
        lastError = error;
      }
      await sleep(200);
    }
    fail(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
  }

  async clickText(text, selector = "button,a,[role='tab']") {
    const encoded = JSON.stringify(text);
    await this.waitFor(`enabled control ${text}`, `(() => {
      const needle = ${encoded};
      return [...document.querySelectorAll(${JSON.stringify(selector)})].some((element) => {
        const label = (element.textContent || '').replace(/\\s+/g, ' ').trim();
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (label === needle || label.includes(needle))
          && !element.disabled
          && rect.width > 0 && rect.height > 0
          && style.visibility !== 'hidden' && style.display !== 'none';
      });
    })()`, 5_000);
    const point = await this.evaluate(`(() => {
      const needle = ${encoded};
      const candidates = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const target = candidates.find((element) => {
        const label = (element.textContent || '').replace(/\\s+/g, ' ').trim();
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (label === needle || label.includes(needle))
          && !element.disabled
          && rect.width > 0 && rect.height > 0
          && style.visibility !== 'hidden' && style.display !== 'none';
      });
      if (!target) return null;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') return null;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    assert(point && Number.isFinite(point.x) && Number.isFinite(point.y), `Could not click visible control: ${text}`);
    // Use the browser input pipeline instead of HTMLElement#click(). React sees
    // the same pointer sequence as a user action, which avoids a CDP-only race
    // around async auth handlers and the first client-side redirect.
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  }

  async fill(selector, value) {
    const encodedSelector = JSON.stringify(selector);
    const encodedValue = JSON.stringify(value);
    const filled = await this.evaluate(`(() => {
      const element = document.querySelector(${encodedSelector});
      if (!element) return false;
      const nativePrototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(nativePrototype, 'value')?.set;
      setter?.call(element, ${encodedValue});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert(filled, `Could not fill ${selector}`);
  }

  async bodyText() {
    return this.evaluate("document.body?.innerText || ''");
  }

  async close() {
    try { await this.send("Page.close"); } catch { /* Chrome may already be closing */ }
    try { this.socket.close(); } catch { /* already closed */ }
  }
}

async function waitForText(text, label = `text ${text}`) {
  await page.waitFor(label, `document.body?.innerText?.includes(${JSON.stringify(text)}) === true`);
}

async function waitForPath(path) {
  try {
    await page.waitFor(`route ${path}`, `location.pathname === ${JSON.stringify(path)}`);
  } catch (error) {
    const state = await page.evaluate(`JSON.stringify({
      href: location.href,
      pathname: location.pathname,
      body: (document.body?.innerText || '').slice(0, 240),
      apiResources: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/api/')).slice(-10)
    })`).catch(() => 'unavailable');
    fail(`${error instanceof Error ? error.message : String(error)}; route state: ${state}`);
  }
}

async function navigate(webUrl, path) {
  await page.navigate(new URL(path, webUrl).toString());
}

async function waitForSession(expectedRole, label) {
  const expected = expectedRole === null
    ? "response.status === 401"
    : `response.ok && payload.role === ${JSON.stringify(expectedRole)}`;
  await page.waitFor(label, `fetch('/api/session', { credentials: 'include', cache: 'no-store' })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      return ${expected};
    })
    .catch(() => false)`, 15_000);
}

async function logoutAndWait(label) {
  await page.clickText("Đăng xuất", 'button[data-action="logout"]');
  await waitForSession(null, `${label} API session revoke`);
  await page.waitFor(`${label} entry screen`, "Boolean(document.querySelector('form input[name=email]'))", 15_000);
}

async function checkEntryNotice() {
  await page.waitFor("login form", "Boolean(document.querySelector('form input[name=email]'))");
  const entryStyles = await page.evaluate(`(() => {
    const submit = document.querySelector('form button[type="submit"]');
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const switchButton = document.querySelector('button.entry-switch');
    return {
      mode: document.querySelector('.app-entry-card') ? 'app' : 'unknown',
      submitMinHeight: submit ? getComputedStyle(submit).minHeight : '',
      submitRadius: submit ? getComputedStyle(submit).borderRadius : '',
      submitCursor: submit ? getComputedStyle(submit).cursor : '',
      switchBackground: switchButton ? getComputedStyle(switchButton).backgroundColor : '',
      tabCount: tabs.length,
      selectedTabCount: tabs.filter((element) => element.getAttribute('aria-selected') === 'true').length,
      panelLabelledByTab: Boolean(document.querySelector('[role="tabpanel"][aria-labelledby]'))
    };
  })()`);
  assert(entryStyles.submitMinHeight === "40px", `Entry submit control min-height is ${entryStyles.submitMinHeight}, expected 40px`);
  assert(entryStyles.submitRadius === "10px", `Entry submit control radius is ${entryStyles.submitRadius}, expected 10px`);
  assert(entryStyles.submitCursor === "pointer", `Entry submit control cursor is ${entryStyles.submitCursor}, expected pointer`);
  if (entryStyles.mode === "app") {
    assert(entryStyles.tabCount === 2 && entryStyles.selectedTabCount === 1 && entryStyles.panelLabelledByTab, "App entry audience tabs do not expose the expected selection semantics");
  } else {
    assert(entryStyles.switchBackground === "rgba(0, 0, 0, 0)", `Entry audience switch background is ${entryStyles.switchBackground}, expected transparent`);
  }

  await page.fill("input[name=email]", "minh.anh.nguyen@e4s.local");
  await page.fill("input[name=password]", "wrong-password");
  await page.evaluate(`(() => {
    const nativeFetch = window.fetch.bind(window);
    let release;
    window.__e4sReleaseLogin = () => release?.();
    window.__e4sRestoreFetch = () => { window.fetch = nativeFetch; delete window.__e4sReleaseLogin; delete window.__e4sRestoreFetch; };
    window.fetch = (...args) => {
      const input = args[0];
      const url = typeof input === 'string' ? input : input?.url;
      if (!String(url).includes('/api/auth/learner/login')) return nativeFetch(...args);
      return new Promise((resolve, reject) => {
        release = () => nativeFetch(...args).then(resolve, reject);
      });
    };
  })()`);
  try {
    await page.clickText("Đăng nhập người học");
    await page.waitFor("auth loading state", `(() => {
      const submit = document.querySelector('form button[type="submit"]');
      return Boolean(submit?.disabled && submit.textContent?.includes('Đang đăng nhập'));
    })()`, 5_000);
    const loading = await page.evaluate(`(() => {
      const submit = document.querySelector('form button[type="submit"]');
      return {
        disabled: Boolean(submit?.disabled),
        label: (submit?.textContent || '').trim(),
        opacity: submit ? getComputedStyle(submit).opacity : '',
        expectedOpacity: document.querySelector('.app-entry-card') ? '0.5' : '0.48'
      };
    })()`);
    assert(loading.disabled, "Entry submit control did not become disabled during login");
    assert(loading.label === "Đang đăng nhập…", `Unexpected login loading label: ${loading.label}`);
    assert(loading.opacity === loading.expectedOpacity, `Disabled login opacity is ${loading.opacity}, expected ${loading.expectedOpacity}`);
    console.log("ok entry loading: login control is disabled with the app loading label");
    await page.evaluate("window.__e4sReleaseLogin?.()");
    await page.waitFor("auth notice", "Boolean(document.querySelector('[role=alert]'))");
    const alert = await page.evaluate("document.querySelector('[role=alert]')?.textContent || ''");
    assert(alert.includes("Không thể đăng nhập"), `Unexpected auth notice: ${alert}`);
  } finally {
    await page.evaluate("window.__e4sRestoreFetch?.()");
  }
  console.log("ok auth notice: invalid learner login is visible");
}

async function checkLearnerSession(webUrl) {
  await page.fill("input[name=email]", "minh.anh.nguyen@e4s.local");
  await page.fill("input[name=password]", "learner-pass");
  await page.clickText("Đăng nhập người học");
  await waitForPath("/home");
  await waitForSession("learner", "learner session state");
  await page.waitFor("learner shell", `(() => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    return [...document.querySelectorAll('nav')].some((element) => visible(element)
      && (element.getAttribute('aria-label') === 'Điều hướng người học'
        || element.getAttribute('aria-label') === 'Điều hướng trên thiết bị di động'));
  })()`);
  await page.waitFor("learner home blocks", "Boolean(document.querySelector('main [data-home-block=\"primary\"]') && document.querySelector('main [data-home-block=\"attendance\"]') && document.querySelector('main [data-home-block=\"metrics\"]'))");
  const shell = await page.evaluate(`(() => ({
    navCount: (() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const nav = [...document.querySelectorAll('nav')].find((element) => visible(element)
        && (element.getAttribute('aria-label') === 'Điều hướng người học'
          || element.getAttribute('aria-label') === 'Điều hướng trên thiết bị di động'));
      return nav?.querySelectorAll('a').length ?? 0;
    })(),
    primaryBlock: Boolean(document.querySelector('main [data-home-block="primary"]')),
    sectionMarginTop: getComputedStyle(document.querySelector('main [data-home-block="attendance"]')).marginTop,
    gridGap: getComputedStyle(document.querySelector('main [data-home-block="metrics"]')).gap,
    gridAlign: getComputedStyle(document.querySelector('main [data-home-block="metrics"]')).alignItems,
    cardPadding: getComputedStyle(document.querySelector('main [data-home-block="primary"]')).padding,
    mode: document.querySelector('.topbar') ? 'app' : 'unknown',
    primaryKind: document.querySelector('main [data-home-block="primary"]')?.classList.contains('hero') ? 'hero' : 'card',
    headingWeight: getComputedStyle(document.querySelector('main h1')).fontWeight
  }))()`);
  assert(shell.navCount === 5, `Learner shell nav count changed: ${shell.navCount}`);
  assert(shell.primaryBlock, "Learner home primary block is missing its semantic data-home-block marker");
  const expectedShell = shell.mode === "app"
    ? { sectionMarginTop: "16px", gridGap: "12px", gridAlign: "stretch", cardPadding: shell.primaryKind === "hero" ? "18px 20px" : "20px" }
    : { sectionMarginTop: "10px", gridGap: "10px", gridAlign: "normal", cardPadding: "18px" };
  assert(shell.sectionMarginTop === expectedShell.sectionMarginTop, `Learner section spacing is ${shell.sectionMarginTop}, expected ${expectedShell.sectionMarginTop}`);
  const metricsGapAllowed = shell.mode === "app" ? ["10px", "12px"] : [expectedShell.gridGap];
  assert(metricsGapAllowed.includes(shell.gridGap), `Learner metrics gap is ${shell.gridGap}, expected one of ${metricsGapAllowed.join(", ")}`);
  assert(shell.gridAlign === expectedShell.gridAlign, `Learner metrics alignment is ${shell.gridAlign}, expected ${expectedShell.gridAlign}`);
  assert(shell.cardPadding === expectedShell.cardPadding, `Learner primary card padding is ${shell.cardPadding}, expected ${expectedShell.cardPadding}`);
  assert(shell.headingWeight === "600", `App heading weight is ${shell.headingWeight}, expected 600`);
  console.log("ok learner shell: session, nav, spacing, grid and typography");

  const notifications = await page.evaluate(`fetch('/api/v1/notifications', { credentials: 'include', cache: 'no-store' })
    .then(async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) }))
    .catch((error) => ({ status: 0, body: { error: String(error) } }))`);
  assert(notifications.status === 200, `Learner notifications did not load for the active session: ${JSON.stringify(notifications)}`);
  console.log("ok notifications: learner session can read the notification feed");

  // Security-only checkpoint. This is deliberately outside the Learner
  // navigation flow: the Learner UI never links to or fetches the staff area.
  // A stale staff URL is normalized to the account's own home during session
  // bootstrap, so the user never lands on a misleading access-warning screen.
  await navigate(webUrl, "/op");
  await waitForPath("/home");
  await page.waitFor("learner stale-route normalization", `location.pathname === '/home' && !document.querySelector('[role="alert"]')`);
  const learnerStaffResources = await page.evaluate(`performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/api/v1/manager/') || name.includes('/api/v1/assessment-reviews') || name.includes('/api/v1/content/') || name.includes('/api/auth/staff/'))`);
  assert(learnerStaffResources.length === 0, `Learner stale-route bootstrap requested staff APIs: ${JSON.stringify(learnerStaffResources)}`);
  console.log("ok security checkpoint: a Learner opening /op is normalized to /home without staff requests");

  await navigate(webUrl, "/reward/preview");
  await waitForText("Certificate of Completion", "learner reward preview");
  const rewardPreview = await page.evaluate(`(() => ({
    path: location.pathname,
    certificate: document.body?.innerText?.includes("Certificate of Completion") === true,
    previewNotice: document.body?.innerText?.includes("Bản xem trước") === true,
    accessAlert: Boolean(document.querySelector('[role="alert"]'))
  }))()`);
  assert(rewardPreview.path === "/reward/preview" && rewardPreview.certificate && rewardPreview.previewNotice && !rewardPreview.accessAlert,
    `Learner reward preview did not render the certificate surface: ${JSON.stringify(rewardPreview)}`);
  console.log("ok learner reward preview: /reward/preview renders the read-only certificate preview");

  const logout = await page.evaluate("Boolean(document.querySelector('button[data-action=logout]'))");
  assert(logout, "Learner logout control is missing");
  await logoutAndWait("learner logout");
  await page.waitFor("logged-out notification guard", `fetch('/api/v1/notifications', { credentials: 'include', cache: 'no-store' })
    .then((response) => response.status === 401)
    .catch(() => false)`);
  console.log("ok notification logout guard: revoked learner session is denied");
  // The learner preview is a real route. Reset the URL before the next role
  // login so staff authentication starts from the entry route, not the old
  // learner certificate path.
  await navigate(webUrl, "/");
  await page.waitFor("entry route after logout", "Boolean(document.querySelector('form input[name=email]'))");
  console.log("ok session logout: entry screen returns");
}

async function checkOperatorRoute(webUrl) {
  await page.clickText("Nhân sự");
  await page.fill("input[name=email]", "thu.ha.tran@e4s.local");
  await page.fill("input[name=password]", "staff-pass");
  await page.clickText("Đăng nhập nhân sự");
  await waitForPath("/op");
  await waitForSession("operator", "operator session state");
  await page.waitFor("operator shell", `(() => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    return [...document.querySelectorAll('nav')].some((element) => visible(element)
      && (element.getAttribute('aria-label') === 'Điều hướng người vận hành'
        || element.getAttribute('aria-label') === 'Điều hướng trên thiết bị di động'));
  })()`);
  const shell = await page.evaluate(`(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const nav = [...document.querySelectorAll('nav')].find((element) => visible(element)
      && (element.getAttribute('aria-label') === 'Điều hướng người vận hành'
        || element.getAttribute('aria-label') === 'Điều hướng trên thiết bị di động'));
    const logout = document.querySelector('button[data-action=logout]');
    return {
      navHrefs: [...(nav?.querySelectorAll('a') ?? [])].map((element) => new URL(element.getAttribute('href') || '', location.href).pathname),
      roleLabel: document.body.innerText.includes('Người vận hành'),
      logoutLabel: (logout?.textContent || '').trim(),
      logoutTitle: logout?.getAttribute('title') || ''
    };
  })()`);
  assert(JSON.stringify(shell.navHrefs) === JSON.stringify(["/op", "/op/weeks", "/op/lessons", "/op/review", "/settings"]), `Operator navigation routes changed: ${JSON.stringify(shell.navHrefs)}`);
  assert(shell.roleLabel, "Operator role label is not visible in the shell");
  assert(shell.logoutLabel === "Đăng xuất" && shell.logoutTitle.includes("Đăng xuất"), "Operator logout target is not clearly labelled");

  const managerResetAttempt = await page.evaluate(`fetch('/api/v1/manager/accounts/${demoManagerId}/password-reset', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'operator-must-not-reset-manager' })
  }).then(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => ({}))
  })).catch((error) => ({ status: 0, body: { error: String(error) } }))`);
  assert(managerResetAttempt.status === 403 && managerResetAttempt.body?.code === "FORBIDDEN",
    `Operator manager-PIN reset was not denied: ${JSON.stringify(managerResetAttempt)}`);
  console.log("ok authorization: Operator cannot reset Manager PIN");

  // Security-only checkpoint. Operator navigation remains under /op; this
  // direct URL probe is not part of the Operator user flow. A stale Manager
  // URL is normalized to the Operator home during session bootstrap.
  await navigate(webUrl, "/mgr");
  await waitForPath("/op");
  await page.waitFor("operator stale-route normalization", `location.pathname === '/op' && !document.querySelector('[role="alert"]')`);
  console.log("ok security checkpoint: an Operator opening /mgr is normalized to /op");

  await navigate(webUrl, "/op/lessons");
  await waitForText("Sinh & duyệt bài học", "operator lessons route");
  const capabilities = await page.evaluate(`fetch('/api/v1/system/capabilities', { credentials: 'include', cache: 'no-store' })
    .then(async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) }))
    .catch((error) => ({ status: 0, body: { error: String(error) } }))`);
  assert(capabilities.status === 200 && capabilities.body?.api === true && capabilities.body?.database === true,
    `System capability check failed: ${JSON.stringify(capabilities)}`);
  if (capabilities.body.ai === false) {
    const noAiText = await page.bodyText();
    assert(noAiText.includes("Chưa có API key") && noAiText.includes("Soạn tay"), "No-AI lessons fallback is not visible");
    console.log("ok no-AI fallback: manual lesson authoring remains visible and AI generation is explained");
  } else {
    console.log("ok no-AI fallback: current stack reports AI available; fallback was not exercised");
  }
  const lessonSemantics = await page.evaluate(`(() => {
    const note = [...document.querySelectorAll('[role=note]')].find((element) => (element.textContent || '').includes('Thêm cột mức'));
    const appRuntime = Boolean(document.querySelector('.app-operator'));
    const select = document.querySelector('select[aria-label="Mức cần thêm"], select[aria-label="Mức CEFR cần thêm"]');
    const addButton = [...document.querySelectorAll('button')].find((element) => (element.textContent || '').trim() === 'Thêm cột mức');
    const group = addButton?.closest('.operator-page-title-actions, .level-column-actions');
    return {
      appRuntime,
      noteText: note?.textContent || '',
      selectLabel: select?.getAttribute('aria-label') || '',
      addButtonFound: Boolean(addButton),
      addButtonEnabled: Boolean(addButton && !addButton.disabled),
      sameActionGroup: Boolean(group && group.contains(select) && group.contains(addButton))
    };
  })()`);
  assert(lessonSemantics.noteText.includes("Mỗi cột là một mức CEFR"), "Operator lessons rationale feedback is missing");
  const expectedAddLevelLabel = lessonSemantics.appRuntime ? "Mức cần thêm" : "Mức CEFR cần thêm";
  assert(lessonSemantics.addButtonFound && lessonSemantics.selectLabel === expectedAddLevelLabel, `Operator add-level target label is ${lessonSemantics.selectLabel}, expected ${expectedAddLevelLabel}`);
  assert(lessonSemantics.addButtonEnabled, "Operator add-level action is unexpectedly disabled");
  assert(lessonSemantics.sameActionGroup, "Operator add-level controls are not grouped as one task");
  console.log("ok operator route: role, feedback semantics and add-level target clarity");

  await logoutAndWait("operator logout");
  await navigate(webUrl, "/");
}

async function checkManagerGuardAndModal(webUrl) {
  await page.clickText("Nhân sự");
  await page.fill("input[name=email]", "quoc.bao.le@e4s.local");
  await page.fill("input[name=password]", "manager-pass");
  await page.clickText("Đăng nhập nhân sự");
  await waitForPath("/mgr");
  await waitForSession("manager", "manager session state");
  await page.waitFor("manager shell", `(() => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    return [...document.querySelectorAll('nav')].some((element) => visible(element)
      && (element.getAttribute('aria-label') === 'Điều hướng quản lý'
        || element.getAttribute('aria-label') === 'Điều hướng trên thiết bị di động'));
  })()`);
  const managerShell = await page.evaluate(`(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const nav = [...document.querySelectorAll('nav')].find((element) => visible(element)
      && (element.getAttribute('aria-label') === 'Điều hướng quản lý'
        || element.getAttribute('aria-label') === 'Điều hướng trên thiết bị di động'));
    return {
      navHrefs: [...(nav?.querySelectorAll('a') ?? [])].map((element) => new URL(element.getAttribute('href') || '', location.href).pathname),
      roleLabel: document.body.innerText.includes('Quản lý')
    };
  })()`);
  assert(JSON.stringify(managerShell.navHrefs) === JSON.stringify(["/mgr", "/mgr/ops", "/mgr/reminders", "/mgr/report", "/settings"]), `Manager navigation routes changed: ${JSON.stringify(managerShell.navHrefs)}`);
  assert(managerShell.roleLabel, "Manager role label is not visible in the shell");
  console.log("ok staff session: manager route shell is visible");

  await navigate(webUrl, "/op/prompts");
  await waitForText("Chế độ xem của Quản lý", "manager operator preview");
  await waitForText("Prompt & rubric", "operator prompt route");
  const guard = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((element) => (element.textContent || '').trim() === 'Lưu prompt');
    const textarea = document.querySelector('.prompt-card textarea, .app-operator textarea');
    return {
      exists: Boolean(button),
      disabled: Boolean(button?.disabled),
      disabledOpacity: button ? getComputedStyle(button).opacity : '',
      disabledCursor: button ? getComputedStyle(button).cursor : '',
      textareaReadOnly: Boolean(textarea?.readOnly || textarea?.disabled),
      preview: document.body.innerText.includes('Chế độ xem của Quản lý')
    };
  })()`);
  assert(guard.exists && guard.disabled && guard.preview, "Manager operator guard did not render a read-only prompt screen");
  const expectedGuardOpacity = await page.evaluate("document.querySelector('.topbar') ? '0.5' : '0.48'");
  assert(guard.disabledOpacity === expectedGuardOpacity && guard.disabledCursor === "not-allowed", `Read-only prompt button style is opacity ${guard.disabledOpacity}, cursor ${guard.disabledCursor}; expected ${expectedGuardOpacity}/not-allowed`);
  assert(guard.textareaReadOnly, "Manager operator preview left prompt fields editable");
  console.log("ok role guard: manager operator preview is read-only");

  await navigate(webUrl, "/home");
  await waitForPath("/mgr");
  console.log("ok manager role guard: /home redirects to /mgr");

  await navigate(webUrl, "/settings");
  await waitForText("Người dùng", "manager account settings");
  const disabledStyle = await page.evaluate(`(() => {
    const disabled = document.querySelector('select:disabled');
    return {
      disabledOpacity: disabled ? getComputedStyle(disabled).opacity : '',
      disabledCursor: disabled ? getComputedStyle(disabled).cursor : '',
      disabledBackground: disabled ? getComputedStyle(disabled).backgroundColor : ''
    };
  })()`);
  assert(disabledStyle.disabledOpacity === "1", `Disabled select opacity is ${disabledStyle.disabledOpacity}, expected readable opacity 1`);
  assert(disabledStyle.disabledCursor === "not-allowed", `Disabled control cursor is ${disabledStyle.disabledCursor}, expected not-allowed`);
  assert(disabledStyle.disabledBackground, "Settings disabled control has no rendered background");
  await page.clickText("Đặt lại mật khẩu");
  await page.waitFor("account password modal", "Boolean(document.querySelector('[role=\"dialog\"], .review-dialog'))");
  const dialog = await page.evaluate(`(() => {
    const modal = document.querySelector('[role="dialog"]') || document.querySelector('.review-dialog');
    const appModal = modal?.matches('[role="dialog"]') === true;
    const cancel = modal?.querySelector('button[data-action="modal-cancel"]')
      || [...(modal?.querySelectorAll('button') ?? [])].find((element) => (element.textContent || '').trim() === 'Hủy');
    return {
      text: modal?.textContent || '',
      appModal,
      modal: modal?.getAttribute('aria-modal') || '',
      focusedInside: Boolean(modal && modal.contains(document.activeElement)),
      cancel: Boolean(cancel),
      primary: Boolean(modal?.querySelector('button[type="submit"]:not(:disabled)')),
      password: Boolean(modal?.querySelector('input[name="password"]'))
    };
  })()`);
  assert(dialog.text.includes("Mật khẩu mới"), `Unexpected shared modal: ${dialog.text}`);
  if (dialog.appModal) {
    assert(dialog.modal === "true" && dialog.focusedInside && dialog.cancel && dialog.primary, "Password modal semantics or focus behavior are incomplete");
  } else {
    assert(dialog.password && dialog.cancel && dialog.primary, "Password modal fields or actions are incomplete");
  }
  await page.clickText("Huỷ", 'button[data-action="modal-cancel"], [role="dialog"] button, .review-dialog button');
  await page.waitFor("modal cancellation", "!document.querySelector('[role=\"dialog\"], .review-dialog')");
  console.log("ok shared modal: prompt opens, focuses, and cancels");
}

async function run(webUrl) {
  page = await launchChrome(new URL("/", webUrl).toString());
  await page.waitFor("entry screen", "Boolean(document.querySelector('form input[name=email]'))");
  await checkEntryNotice();
  await checkLearnerSession(webUrl);
  await checkOperatorRoute(webUrl);
  await checkManagerGuardAndModal(webUrl);
  await page.captureScreenshot(freshScreenshotPath, 390, 844);
  console.log(`ok fresh screenshot: ${freshScreenshotPath} (390x844)`);
}

async function cleanup() {
  await page?.close();
  stopProcessTree(chromeProcess);
  stopProcessTree(localProcess);
  if (chromeProfile) await rm(chromeProfile, { recursive: true, force: true }).catch(() => undefined);
}

try {
  const webUrl = await findAvailableWebUrl();
  const apiUrl = resolveApiUrl(webUrl);
  console.log(`E4S E2E target: ${webUrl}`);
  await checkLocalApi(apiUrl);
  await checkLocalRoleFixtures(apiUrl);
  await run(webUrl);
  console.log("E2E PASS: local API health, auth loading/session, learner/operator route shells, role guards, operator semantics, modal/notice, shared CSS");
} catch (error) {
  console.error(`E2E FAIL: ${error instanceof Error ? error.message : String(error)}`);
  if (localProcess?.e4sOutput) console.error(`Local stack output:\n${localProcess.e4sOutput()}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
