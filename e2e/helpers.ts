import { expect, type Page } from "@playwright/test";

export async function createChallenge(page: Page, opts: { name: string; host: string; duration?: "7 days" | "14 days" | "30 days" }) {
  await page.goto("/");
  await page.getByRole("link", { name: "Create a challenge" }).click();
  await page.getByLabel("Challenge name").fill(opts.name);
  if (opts.duration) await page.getByRole("radio", { name: opts.duration }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill(opts.host);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // default goal: 20 pages/day
  await page.getByLabel("Title").fill("Atomic Habits");
  await page.getByRole("button", { name: "Create challenge" }).click();
  await expect(page.getByRole("heading", { name: "Your challenge is ready" })).toBeVisible();
  const url = (await page.getByLabel("Invite link").textContent())!.trim();
  await page.getByRole("button", { name: /Go to my challenge/ }).click();
  await expect(page.getByRole("heading", { name: "Your reading crew" })).toBeVisible();
  return { inviteUrl: url, challengeUrl: page.url() };
}

export async function join(page: Page, inviteUrl: string, name: string, opts: { book?: string; goal?: string } = {}) {
  await page.goto(new URL(inviteUrl).pathname);
  await page.getByRole("button", { name: "Join the challenge" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  if (opts.goal) await page.getByRole("radio", { name: new RegExp(`^${opts.goal}`) }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  if (opts.book) {
    await page.getByLabel("Title").fill(opts.book);
    await page.getByRole("button", { name: "Join challenge" }).click();
  } else {
    await page.getByRole("button", { name: "Skip for now" }).click();
  }
  await expect(page.getByRole("heading", { name: "You're in" })).toBeVisible();
  await page.getByRole("button", { name: /Open my challenge/ }).click();
  await expect(page.getByRole("heading", { name: "Your reading crew" })).toBeVisible();
}

export async function logReading(page: Page, amount: number, reflection?: string) {
  await page.getByRole("button", { name: "Log reading", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Log reading" });
  await dialog.getByLabel("How much?").fill(String(amount));
  if (reflection) await dialog.getByLabel(/What stood out/).fill(reflection);
  await dialog.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(dialog.getByRole("status")).toBeVisible();
  const offline = await dialog.getByText("Saved on this device").isVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  return { offline };
}

export async function waitForSynced(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: "Synced" })).toBeVisible({ timeout: 30_000 });
}

/** The big number in the centre of the day ring, plus its caption. */
export async function expectToday(page: Page, amount: number, caption: string) {
  await expect(page.getByTestId("ring-figure")).toHaveText(String(amount));
  await expect(page.getByText(caption)).toBeVisible();
}
