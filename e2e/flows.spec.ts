import { expect, test } from "@playwright/test";
import { createChallenge, expectToday, join, logReading, waitForSynced } from "./helpers";

test("Flow A: create → copy link → join → goal → check-in", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const { inviteUrl } = await createChallenge(host, { name: "Flow A Challenge", host: "Jessica" });
  expect(inviteUrl).toMatch(/\/join\/[0-9A-Za-z]{12}$/);

  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await friend.goto(new URL(inviteUrl).pathname);
  await expect(friend.getByRole("heading", { name: "Flow A Challenge" })).toBeVisible();
  await expect(friend.getByText("Started by")).toContainText("Jessica");
  await join(friend, inviteUrl, "David", { goal: "Minutes", book: "Deep Work" });

  await logReading(friend, 25, "Attention residue is real.");
  await expectToday(friend, 25, "of 30 minutes today");
  await waitForSynced(friend);

  // The host sees the new member and their check-in.
  await host.reload();
  await expect(host.getByRole("link", { name: /David/ }).first()).toBeVisible();
  await host.getByRole("link", { name: "Feed" }).click();
  await expect(host.getByText("Attention residue is real.")).toBeVisible();
  await expect(host.getByText("Powered by Pursion")).toBeVisible();
  await hostCtx.close();
  await friendCtx.close();
});

test("Flow B: offline check-in survives reload and syncs once on reconnect", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const { inviteUrl, challengeUrl } = await createChallenge(host, { name: "Flow B Challenge", host: "Amaka" });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await join(page, inviteUrl, "Tolu");
  // Make sure the service worker controls the page and has cached it.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your reading crew" })).toBeVisible();
  const url = page.url();

  await ctx.setOffline(true);
  const { offline } = await logReading(page, 17, "Read on the train");
  expect(offline).toBe(true);
  await expect(page.getByText("You're offline.")).toBeVisible();
  await expectToday(page, 17, "of 20 pages today");

  // Close and reopen the app while still offline.
  await page.close();
  const reopened = await ctx.newPage();
  await reopened.goto(url);
  await expectToday(reopened, 17, "of 20 pages today");
  await expect(reopened.getByRole("status").filter({ hasText: /Offline/ })).toBeVisible();

  await ctx.setOffline(false);
  await reopened.evaluate(() => window.dispatchEvent(new Event("online")));
  await waitForSynced(reopened);

  await host.goto(`${challengeUrl}/feed`);
  await expect(host.getByText("Read on the train")).toHaveCount(1);
  await expect(host.getByRole("listitem").filter({ hasText: "17 pages" })).toHaveCount(1);
  await hostCtx.close();
  await ctx.close();
});

test("Flow C: multiple participants → feed → reactions → stats", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const { inviteUrl, challengeUrl } = await createChallenge(host, { name: "Flow C Challenge", host: "Jessica" });
  await logReading(host, 20, "Identity chapter!");
  await waitForSynced(host);

  const people = ["David", "Amaka"];
  const ctxs = [];
  for (const [i, name] of people.entries()) {
    const ctx = await browser.newContext();
    ctxs.push(ctx);
    const page = await ctx.newPage();
    await join(page, inviteUrl, name);
    await logReading(page, 10 + i * 5);
    await page.getByRole("link", { name: "Feed" }).click();
    const jessicaPost = page.getByRole("listitem").filter({ hasText: "Identity chapter!" });
    await jessicaPost.getByRole("button", { name: /^Fire/ }).click();
    await expect(jessicaPost.getByRole("button", { name: /^Fire/ })).toHaveAttribute("aria-pressed", "true");
    await waitForSynced(page);
  }

  await host.goto(`${challengeUrl}/feed`);
  const post = host.getByRole("listitem").filter({ hasText: "Identity chapter!" });
  await expect(post.getByRole("button", { name: "Fire, 2" })).toBeVisible();

  await host.goto(`${challengeUrl}/stats`);
  await expect(host.getByText("Participants").locator("..")).toContainText("3");
  await expect(host.getByLabel("45 pages read together")).toBeVisible();
  const mostPages = host.locator("section").filter({ hasText: "Most pages" }).last();
  await expect(mostPages).toContainText("20");
  await expect(mostPages).toContainText("Jessica");
  for (const c of ctxs) await c.close();
  await hostCtx.close();
});

test("Flow D: challenge ends → completion screen and share card", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const { challengeUrl } = await createChallenge(page, { name: "Flow D Challenge", host: "Samuel", duration: "7 days" });
  await logReading(page, 30);
  await waitForSynced(page);

  // Jump the device clock past the end of the 7-day challenge.
  await page.clock.install({ time: new Date(Date.now() + 9 * 86_400_000) });
  await page.goto(challengeUrl);
  await expect(page.getByText("Flow D Challenge is complete")).toBeVisible();
  await page.getByRole("link", { name: "See your recap" }).click();
  await expect(page.getByRole("heading", { name: "Challenge complete" })).toBeVisible();
  await expect(page.getByText(/You showed up for/)).toContainText("1 of 7 days");
  await expect(page.getByText("30 pages").first()).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share my result" }).click();
  expect((await download).suggestedFilename()).toBe("still-reading-result.png");
  await expect(page.getByRole("img", { name: "Your Still Reading result card" })).toBeVisible();
  await ctx.close();
});
