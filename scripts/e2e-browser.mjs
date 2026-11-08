#!/usr/bin/env node
/**
 * Browser end-to-end test (T-24): sample -> profile -> drafted bible -> chapters
 * 1..3 (with the mock's chapter-2 veto and a retry) -> final story -> reload restore.
 *
 * Usage: BASE_URL=https://host DEMO_ACCESS_CODE=... node scripts/e2e-browser.mjs [shot.png]
 */
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8000";
const shot = process.argv[2];
const sample = Array.from({ length: 22 }, (_, i) => Array.from({ length: 10 }, (_, k) => `w${(i * 10 + k) % 97}x`).join(" ") + ".").join(" ");
const T = 60_000;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2000 } });
page.on("dialog", (d) => void d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const step = (s) => console.log(`ok: ${s}`);

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  if (process.env.DEMO_ACCESS_CODE) await page.getByLabel("Demo access code").fill(process.env.DEMO_ACCESS_CODE);

  await page.getByLabel("Sample text").fill(sample);
  await page.getByRole("button", { name: "Analyse style" }).click();
  await page.getByRole("heading", { name: /^02\s+Style profile/ }).waitFor({ timeout: T });
  step("style profile shown");

  const seed = page.locator('section[aria-labelledby="seed-h"]');
  await seed.getByLabel("Genre").fill("Test genre");
  await seed.getByLabel("Tone").fill("Test tone");
  await seed.getByLabel("Idea (at most two sentences)").fill("A test idea.");
  await seed.getByRole("button", { name: "Draft core" }).click();
  await seed.getByRole("button", { name: "Accept core" }).click({ timeout: T });
  await seed.getByRole("button", { name: "Draft structure" }).click();
  await seed.getByRole("button", { name: "Accept structure" }).click({ timeout: T });
  step("bible drafted and accepted");

  for (const n of [1, 2, 3]) {
    await page.getByRole("button", { name: `Write chapter ${n}` }).click({ timeout: T });
    const accepted = page.getByRole("heading", { name: new RegExp(`^Chapter ${n} · `) });
    const retry = page.getByRole("button", { name: "Retry from outline" });
    await Promise.race([accepted.waitFor({ timeout: T }), retry.waitFor({ timeout: T })]);
    if (await retry.isVisible()) {
      step(`chapter ${n} vetoed; retrying`);
      await retry.click();
      await accepted.waitFor({ timeout: T });
    }
    step(`chapter ${n} accepted`);
  }
  await page.getByRole("button", { name: "Download story (.md)" }).waitFor({ timeout: T });
  await page.getByText("All three chapters are accepted.").waitFor({ timeout: T });
  if (await page.getByRole("button", { name: /^Write chapter/ }).count()) throw new Error("a 4th chapter can be started");
  step("final story with download; no 4th chapter");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Your last session was restored.").waitFor({ timeout: T });
  if ((await page.locator('section[aria-labelledby="final-h"] article').count()) !== 3) throw new Error("restore lost chapters");
  step("session restored after reload");

  // T-23a: switch the UI to Simplified Chinese; the story itself stays as written.
  await page.getByLabel("Interface language").selectOption("zh-CN");
  await page.getByRole("heading", { name: /^01\s+样本/ }).waitFor({ timeout: T });
  await page.getByRole("heading", { name: /^05\s+完整故事/ }).waitFor({ timeout: T });
  if ((await page.evaluate(() => document.documentElement.lang)) !== "zh-CN") throw new Error("html lang not updated");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /^01\s+样本/ }).waitFor({ timeout: T });
  step("UI switched to 中文 and kept after reload");

  if (shot) await page.screenshot({ path: shot, fullPage: false });
  if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
  console.log("PASS: browser e2e");
} catch (e) {
  console.error(`FAIL: ${e instanceof Error ? e.message : e}`);
  if (shot) await page.screenshot({ path: shot.replace(/\.png$/, "-fail.png"), fullPage: true }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}
