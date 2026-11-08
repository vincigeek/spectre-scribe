#!/usr/bin/env node
/**
 * Browser end-to-end test (T-24) over the five workspace pages:
 * Sample -> Style -> Bible (drafted from a seed) -> Chapters 1..3 (with the mock's
 * chapter-2 veto and a retry) -> Final story -> reload restore -> 中文 UI.
 *
 * Usage: BASE_URL=https://host DEMO_ACCESS_CODE=... node scripts/e2e-browser.mjs [shot-prefix]
 */
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8000";
const shot = process.argv[2];
const sample = Array.from({ length: 22 }, (_, i) => Array.from({ length: 10 }, (_, k) => `w${(i * 10 + k) % 97}x`).join(" ") + ".").join(" ");
const T = 60_000;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const step = (s) => console.log(`ok: ${s}`);
const tab = (name) => page.getByRole("tab", { name });
const snap = async (name) => shot && page.screenshot({ path: `${shot}-${name}.png`, fullPage: true });

async function expectTab(name, { selected, disabled }) {
  const el = tab(name);
  await el.waitFor({ timeout: T });
  if (selected !== undefined && (await el.getAttribute("aria-selected")) !== String(selected)) throw new Error(`tab ${name} selected!=${selected}`);
  if (disabled !== undefined && (await el.isDisabled()) !== disabled) throw new Error(`tab ${name} disabled!=${disabled}`);
}

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  if (process.env.DEMO_ACCESS_CODE) await page.getByLabel("Demo access code").fill(process.env.DEMO_ACCESS_CODE);

  // Five pages; only Sample is open at the start.
  if ((await page.getByRole("tab").count()) !== 5) throw new Error("expected five page tabs");
  await expectTab(/Sample/, { selected: true });
  for (const n of [/Style/, /Bible/, /Chapters/, /Final/]) await expectTab(n, { disabled: true });
  if (await page.getByRole("heading", { name: /Story bible/ }).isVisible()) throw new Error("bible page visible on sample page");
  step("five page tabs; later pages locked");
  await snap("1-sample");

  await page.getByLabel("Sample text").fill(sample);
  await page.getByRole("button", { name: "Analyse style" }).click();
  await page.getByRole("heading", { name: /^02\s+Style profile/ }).waitFor({ timeout: T });
  await expectTab(/Style/, { selected: true });
  if (await page.getByLabel("Sample text").isVisible()) throw new Error("sample page still visible");
  step("analysis moves to the Style page");
  await snap("2-style");

  await page.getByRole("button", { name: /Next: Bible/ }).click();
  const seed = page.locator("section", { has: page.getByRole("heading", { name: "Draft from a seed" }) });
  await seed.getByLabel("Genre").fill("Test genre");
  await seed.getByLabel("Tone").fill("Test tone");
  await seed.getByLabel("Idea (at most two sentences)").fill("A test idea.");
  await seed.getByRole("button", { name: "Draft core" }).click();
  await seed.getByRole("button", { name: "Accept core" }).click({ timeout: T });
  await seed.getByRole("button", { name: "Draft structure" }).click();
  await seed.getByRole("button", { name: "Accept structure" }).click({ timeout: T });
  await page.getByText("The bible passes every check").waitFor({ timeout: T });
  await expectTab(/Chapters/, { disabled: false });
  step("bible drafted; Chapters page unlocked");
  await snap("3-bible");

  await tab(/Chapters/).click();
  for (const n of [1, 2, 3]) {
    await page.getByRole("button", { name: `Write chapter ${n}` }).click({ timeout: T });
    const next = n < 3 ? page.getByRole("button", { name: `Write chapter ${n + 1}` }) : page.getByText("All three chapters are accepted.");
    const retry = page.getByRole("button", { name: "Retry from outline" });
    await Promise.race([next.waitFor({ timeout: T }), retry.waitFor({ timeout: T })]);
    if (await retry.isVisible()) {
      step(`chapter ${n} vetoed; retrying`);
      if (n === 2) await snap("4-veto");
      await retry.click();
      await next.waitFor({ timeout: T });
    }
    step(`chapter ${n} accepted`);
  }
  if (await page.getByRole("button", { name: /^▶ Write chapter/ }).count()) throw new Error("a 4th chapter can be started");
  await page.getByRole("button", { name: /Read the final story/ }).click();
  await expectTab(/Final/, { selected: true });
  if ((await page.getByRole("heading", { name: /^Chapter \d · / }).count()) !== 3) throw new Error("final page lacks 3 chapters");
  await page.getByRole("button", { name: "Download story (.md)" }).waitFor({ timeout: T });
  step("Final page shows 3 chapters and downloads; no 4th chapter");
  await snap("5-final");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Your last session was restored.").waitFor({ timeout: T });
  await expectTab(/Final/, { selected: true });
  step("reload restores the session on the Final page");

  await page.getByLabel("Interface language").selectOption("zh-CN");
  await page.getByRole("tab", { name: /成稿/ }).waitFor({ timeout: T });
  await page.getByRole("heading", { name: /^05\s+完整故事/ }).waitFor({ timeout: T });
  if ((await page.evaluate(() => document.documentElement.lang)) !== "zh-CN") throw new Error("html lang not updated");
  await page.getByRole("tab", { name: /样本/ }).click();
  await page.getByRole("heading", { name: /^01\s+样本/ }).waitFor({ timeout: T });
  step("UI switched to 中文; pages switch by tab");
  await snap("6-zh");

  if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
  console.log("PASS: browser e2e");
} catch (e) {
  console.error(`FAIL: ${e instanceof Error ? e.message : e}`);
  if (shot) await page.screenshot({ path: `${shot}-fail.png`, fullPage: true }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}
