import { expect, test } from "@playwright/test";
import { createChallenge, expectToday, join, logReading, newContext, waitForSynced } from "./helpers";

test("Flow A: create → copy link → join → goal → check-in", async ({ browser }) => {
  const hostCtx = await newContext(browser);
  const host = await hostCtx.newPage();
  const { inviteUrl } = await createChallenge(host, { name: "Flow A Challenge", host: "Jessica" });
  expect(inviteUrl).toMatch(/\/join\/[0-9A-Za-z]{12}$/);

  const friendCtx = await newContext(browser);
  const friend = await friendCtx.newPage();
  await friend.goto(new URL(inviteUrl).pathname);
  await expect(friend.getByRole("heading", { name: "Flow A Challenge" })).toBeVisible();
  await expect(friend.getByText("Started by")).toContainText("Jessica");
  await join(friend, inviteUrl, "David", { goal: "Minutes", book: "Deep Work", author: "Cal Newport" });

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
  const hostCtx = await newContext(browser);
  const host = await hostCtx.newPage();
  const { inviteUrl, challengeUrl } = await createChallenge(host, { name: "Flow B Challenge", host: "Amaka" });

  const ctx = await newContext(browser);
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
  const hostCtx = await newContext(browser);
  const host = await hostCtx.newPage();
  const { inviteUrl, challengeUrl } = await createChallenge(host, { name: "Flow C Challenge", host: "Jessica" });
  await logReading(host, 20, "Identity chapter!");
  await waitForSynced(host);

  const people = ["David", "Amaka"];
  const ctxs = [];
  for (const [i, name] of people.entries()) {
    const ctx = await newContext(browser);
    ctxs.push(ctx);
    const page = await ctx.newPage();
    await join(page, inviteUrl, name);
    await logReading(page, 10 + i * 5);
    await page.getByRole("link", { name: "Feed" }).click();
    const jessicaPost = page.getByRole("listitem").filter({ hasText: "Identity chapter!" });
    await jessicaPost.getByRole("button", { name: /^Fire/ }).click();
    await expect(jessicaPost.getByRole("button", { name: /^Fire/ })).toHaveAttribute("aria-pressed", "true");
    if (name === "David") {
      await jessicaPost.getByRole("button", { name: /^Haha/ }).click();
      // Replies open the check-in as a thread.
      await jessicaPost.getByRole("link", { name: "Reply" }).click();
      await expect(page.getByRole("heading", { name: "Thread on Jessica's check-in" })).toBeAttached();
      await page.getByLabel("Reply to Jessica").fill("Which part of the identity chapter?");
      await page.getByRole("button", { name: "Reply", exact: true }).click();
      await expect(page.getByRole("region", { name: "Replies" })).toContainText("Which part of the identity chapter?");
      await page.getByRole("link", { name: "Back to feed" }).click();
    }
    await waitForSynced(page);
  }

  await host.goto(`${challengeUrl}/feed`);
  const post = host.getByRole("listitem").filter({ hasText: "Identity chapter!" });
  await expect(post.getByRole("button", { name: "Fire, 2" })).toBeVisible();
  await expect(post.getByRole("button", { name: "Haha, 1" })).toBeVisible();
  await post.getByRole("link", { name: /1 reply/ }).click();
  await expect(host.getByRole("region", { name: "Replies" })).toContainText("David");
  await expect(host.getByRole("region", { name: "Replies" })).toContainText("Which part of the identity chapter?");
  // Like David's reply and answer it in context (nested under his reply).
  const replies = host.getByRole("region", { name: "Replies" });
  await replies.getByRole("button", { name: /^Like David's reply/ }).click();
  await expect(replies.getByRole("button", { name: "Like David's reply, 1" })).toHaveAttribute("aria-pressed", "true");
  await replies.getByRole("button", { name: "Reply to David" }).click();
  await expect(host.getByText("Replying to David")).toBeVisible();
  await host.getByRole("textbox", { name: "Reply to David" }).fill("The part about identity votes!");
  await host.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(replies.getByRole("listitem").filter({ hasText: "Which part of the identity chapter?" }).first()).toContainText("The part about identity votes!");
  await expect(host.getByText("Replying to David")).toBeHidden();

  await host.goto(`${challengeUrl}/stats`);
  await expect(host.getByText("Participants").locator("..")).toContainText("3");
  await expect(host.getByLabel("45 pages read together")).toBeVisible();
  const mostPages = host.locator("section").filter({ hasText: "Most pages" }).last();
  await expect(mostPages).toContainText("20");
  await expect(mostPages).toContainText("Jessica");

  // The host can pull up any day's top three (to screenshot and share); other readers can't.
  await host.goto(`${challengeUrl}/leaderboard`);
  const daily = host.getByRole("region", { name: "Top 3 by day" });
  await expect(daily.getByRole("radio", { name: "Today" })).toHaveAttribute("aria-checked", "true");
  const top = daily.getByRole("list", { name: "Top readers" });
  await expect(top.getByRole("listitem")).toHaveCount(3);
  await expect(top.getByRole("listitem").first()).toContainText("Jessica");
  await expect(top.getByRole("listitem").first()).toContainText("20 pages");
  await daily.getByRole("radio", { name: "Pick a day" }).click();
  await expect(daily.getByRole("textbox", { name: "Day" })).toBeVisible();
  const friend = await ctxs[0]!.newPage();
  await friend.goto(`${challengeUrl}/leaderboard`);
  await expect(friend.getByText("How XP works")).toBeVisible();
  await expect(friend.getByRole("region", { name: "Top 3 by day" })).toHaveCount(0);

  // The host can step the feed's summary back through earlier days; on day 1 there's nowhere to go yet.
  await host.goto(`${challengeUrl}/feed`);
  const stepper = host.getByRole("group", { name: "Show another day" });
  await expect(stepper.getByRole("button", { name: "Previous day" })).toBeDisabled();
  await expect(stepper.getByRole("button", { name: "Next day" })).toBeDisabled();
  await expect(stepper).toContainText("Today");
  await friend.goto(`${challengeUrl}/feed`);
  await expect(friend.getByText("have checked in")).toBeVisible();
  await expect(friend.getByRole("group", { name: "Show another day" })).toHaveCount(0);
  for (const c of ctxs) await c.close();
  await hostCtx.close();
});

test("Flow D: challenge ends → completion screen and share card", async ({ browser }) => {
  const ctx = await newContext(browser);
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

test("Flow E: install modal pops on every visit and can be skipped", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  const modal = page.getByRole("dialog", { name: /one tap away|one click away|Open in your browser/ });
  await expect(modal).toBeVisible();
  // Android without a native prompt yet falls back to browser-menu steps.
  await expect(modal.getByText("Add to Home screen")).toBeVisible();
  await modal.getByRole("button", { name: "Not now" }).click();
  await expect(modal).toBeHidden();

  // Skipped for the rest of this visit…
  await page.getByRole("link", { name: "Create a challenge" }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog")).toBeHidden();

  // …but a new visit asks again, and ✕ also closes it.
  const again = await ctx.newPage();
  await again.goto("/");
  const modal2 = again.getByRole("dialog", { name: /one tap away/ });
  await expect(modal2).toBeVisible();
  await modal2.getByRole("button", { name: "Close" }).click();
  await expect(modal2).toBeHidden();
  await ctx.close();
});

test("Flow F: iPhone Safari gets Add to Home Screen steps", async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto("/");
  const modal = page.getByRole("dialog", { name: /one tap away/ });
  await expect(modal).toBeVisible();
  await expect(modal.getByText("Add to Home Screen")).toBeVisible();
  await expect(modal.getByText("Open as Web App")).toBeVisible();
  await ctx.close();
});

test("Flow G: Reading Pass carries a reader and their private reflections to a new phone", async ({ browser }) => {
  const ctxA = await newContext(browser);
  const phoneA = await ctxA.newPage();
  await phoneA.goto("/");
  await phoneA.getByRole("link", { name: "Create a challenge" }).click();
  await phoneA.getByLabel("Challenge name").fill("Flow G Challenge");
  await phoneA.getByRole("button", { name: "Continue" }).click();
  await phoneA.getByLabel("Your name").fill("Miracle");
  await phoneA.getByRole("button", { name: "Continue" }).click();
  await phoneA.getByRole("button", { name: "Continue" }).click();
  await phoneA.getByRole("button", { name: "Skip for now" }).click();
  // The pass is shown right away on the "ready" screen.
  await expect(phoneA.getByRole("heading", { name: "Here's your Reading Pass" })).toBeVisible();
  await phoneA.getByRole("button", { name: /Go to my challenge/ }).click();

  // Private reflection.
  await phoneA.getByRole("button", { name: "Log reading", exact: true }).click();
  const dialog = phoneA.getByRole("dialog", { name: "Log reading" });
  await dialog.getByLabel("How much?").fill("12");
  await dialog.getByLabel(/What stood out/).fill("Just between me and the book");
  await dialog.getByText("Share my reflection with the crew").click();
  await dialog.getByRole("button", { name: "Check in", exact: true }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await waitForSynced(phoneA);

  // Closing the home notice keeps the pass in Settings.
  await phoneA.getByRole("region", { name: "Your Reading Pass" }).getByRole("button", { name: "Close" }).click();
  await expect(phoneA.getByRole("region", { name: "Your Reading Pass" })).toHaveCount(0);
  await phoneA.getByRole("link", { name: "Challenge settings" }).click();
  await phoneA.getByRole("button", { name: "Show pass" }).click();
  const label = await phoneA.getByLabel(/^Reading Pass: /).getAttribute("aria-label");
  const pass = label!.replace("Reading Pass: ", "");
  expect(pass).toMatch(/^[A-Z]+ [A-Z]+ [A-Z]+ [A-Z]+ \d{2}$/);
  await waitForSynced(phoneA);

  // New phone: enter the pass (any case) and carry on.
  const ctxB = await newContext(browser);
  const phoneB = await ctxB.newPage();
  await phoneB.goto("/");
  await phoneB.getByRole("link", { name: /Use your Reading Pass/ }).click();
  await phoneB.getByLabel("Your Reading Pass").fill(pass.toLowerCase());
  await phoneB.getByRole("button", { name: "Continue" }).click();
  await expect(phoneB.getByRole("heading", { name: "Your reading crew" })).toBeVisible();
  await expectToday(phoneB, 12, "of 20 pages today");
  await phoneB.getByRole("link", { name: "Feed" }).click();
  await expect(phoneB.getByText("Just between me and the book")).toBeVisible();
  await expect(phoneB.getByText("Private", { exact: true })).toBeVisible();

  // A wrong pass is refused.
  const ctxC = await newContext(browser);
  const phoneC = await ctxC.newPage();
  await phoneC.goto("/pass#WRONG-WORDS-HERE-TODAY-00");
  await phoneC.getByRole("button", { name: "Continue" }).click();
  await expect(phoneC.getByText("We couldn't find that Reading Pass", { exact: false })).toBeVisible();
  await ctxA.close();
  await ctxB.close();
  await ctxC.close();
});

test("Flow H: opening a challenge asks the server to find missing book covers", async ({ browser }) => {
  const hostCtx = await newContext(browser);
  const host = await hostCtx.newPage();
  const { inviteUrl } = await createChallenge(host, { name: "Flow H Challenge", host: "Victory" });
  const friendCtx = await newContext(browser);
  const friend = await friendCtx.newPage();
  await join(friend, inviteUrl, "Temi", { book: "Red Rising", author: "Pierce Brown" });
  await waitForSynced(friend);

  const fill = host.waitForResponse((r) => /\/api\/challenges\/ch_[^/]+\/covers$/.test(r.url()) && r.request().method() === "POST");
  await host.reload();
  const res = await fill;
  expect(res.status()).toBe(200);
  // Open Library isn't reachable from the test sandbox, so lookups report as failed rather than erroring.
  expect(await res.json()).toMatchObject({ filled: expect.any(Number), checked: expect.any(Number), remaining: expect.any(Number), failed: expect.any(Array) });

  // A new book from the check-in needs its author as well as its title (that's how its cover is found).
  await host.getByRole("button", { name: "Log reading", exact: true }).click();
  const dialog = host.getByRole("dialog", { name: "Log reading" });
  await dialog.getByLabel("How much?").fill("15");
  await dialog.getByRole("button", { name: "+ New book" }).click();
  await dialog.getByLabel("Book title").fill("The Creative Act");
  await dialog.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("title and author");
  await dialog.getByLabel("Author", { exact: true }).fill("Rick Rubin");
  await dialog.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(dialog.getByRole("status")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await host.getByRole("link", { name: "Me", exact: true }).click();
  await host.getByRole("button", { name: "The Creative Act" }).click();
  await expect(host.getByRole("dialog", { name: "Book" }).getByRole("paragraph").filter({ hasText: "Rick Rubin" })).toBeVisible();
  await hostCtx.close();
  await friendCtx.close();
});

test("Flow I: host merges a reader who joined twice", async ({ browser }) => {
  const hostCtx = await newContext(browser);
  const host = await hostCtx.newPage();
  const { inviteUrl, challengeUrl } = await createChallenge(host, { name: "Flow I Challenge", host: "Jessica" });
  const first = await newContext(browser);
  const second = await newContext(browser);
  const firstPage = await first.newPage();
  const secondPage = await second.newPage();
  await join(firstPage, inviteUrl, "Temi");
  await join(secondPage, inviteUrl, "temi O"); // Same person, in another browser.
  await logReading(secondPage, 25);
  await waitForSynced(secondPage);
  await logReading(firstPage, 10);
  await waitForSynced(firstPage);

  await host.goto(`${challengeUrl}/settings`);
  const panel = host.getByRole("region", { name: "Duplicate members" });
  const suggestion = panel.getByRole("list", { name: "Possible duplicates" }).getByRole("listitem").first();
  await expect(suggestion).toContainText("Similar names: Temi / temi O");
  // The copy with more reading is the one to keep.
  await suggestion.getByRole("button", { name: "Merge Temi → temi O" }).click();
  await expect(panel.getByRole("status").first()).toContainText("Moves 1 check-in (10 pages)");
  await panel.getByRole("button", { name: "Merge", exact: true }).click();
  await panel.getByRole("button", { name: "Yes, merge" }).click();
  await expect(panel.getByText("Merged Temi into temi O.")).toBeVisible();
  await waitForSynced(host);

  await host.goto(`${challengeUrl}/leaderboard`);
  const top = host.getByRole("list", { name: "Top readers" }).first();
  await expect(top.getByRole("listitem").filter({ hasText: "temi O" })).toContainText("35 pages");
  await expect(host.getByText("Temi", { exact: true })).toHaveCount(0);
  for (const c of [first, second, hostCtx]) await c.close();
});

test("Flow J: a browser that blocks storage gets told how to join instead of a dead button", async ({ browser }) => {
  const hostCtx = await newContext(browser);
  const host = await hostCtx.newPage();
  const { inviteUrl } = await createChallenge(host, { name: "Flow J Challenge", host: "Jessica" });

  // Like some in-app browsers: no IndexedDB.
  const blocked = await newContext(browser);
  await blocked.addInitScript(() => Object.defineProperty(window, "indexedDB", { get: () => undefined }));
  const page = await blocked.newPage();
  await page.goto(new URL(inviteUrl).pathname);
  const joinButton = page.getByRole("button", { name: "Join the challenge" });
  await expect(joinButton).toBeEnabled();
  await joinButton.click();
  await expect(page.getByRole("heading", { name: "This browser can't save your reading." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy invite link" })).toBeVisible();
  await blocked.close();
  await hostCtx.close();
});

test("Flow K: earning badges pops a celebration with share and save, and they stay on the profile", async ({ browser }) => {
  const ctx = await newContext(browser);
  await ctx.addInitScript(() => localStorage.setItem("sr-badge-popups", "on"));
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  const { challengeUrl } = await createChallenge(page, { name: "Flow K Challenge", host: "Jessica" });
  await logReading(page, 30);

  const dialog = page.getByRole("dialog", { name: /^New badge/ });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole("heading", { name: "First Page" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Share" })).toBeEnabled({ timeout: 15_000 });
  await expect(dialog.getByRole("button", { name: "Save image" })).toBeEnabled({ timeout: 15_000 });
  // Sharing makes the badge's public page, with a link preview image.
  const made = page.waitForResponse((r) => r.url().endsWith("/badges/share") && r.request().postDataJSON()?.public === true);
  await dialog.getByRole("button", { name: "Share" }).click();
  const shared = (await (await made).json()) as { url: string; public: boolean };
  expect(shared.public).toBe(true);
  const visitor = await (await newContext(browser)).newPage();
  await visitor.goto(shared.url);
  await expect(visitor.getByRole("heading", { name: "First Page" })).toBeVisible();
  await expect(visitor.getByText("Jessica earned")).toBeVisible();
  await expect(visitor.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/b\/[A-Za-z0-9_-]{16}\/image\?format=og$/);
  await visitor.context().close();
  // Several new badges show one after another.
  while (await dialog.getByRole("button", { name: "Next badge" }).isVisible()) await dialog.getByRole("button", { name: "Next badge" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);

  // Seen once: it doesn't pop up again.
  await page.reload();
  await expect(page.getByRole("button", { name: "Log reading", exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog", { name: /^New badge/ })).toHaveCount(0);

  // On the profile: earned in colour, the rest locked with progress.
  await page.goto(`${challengeUrl}/me`);
  await page.getByRole("tab", { name: /Badges/ }).click();
  const grid = page.getByRole("list", { name: "Your badges" });
  await expect(grid.getByRole("button", { name: "First Page: Earned" })).toBeVisible();
  await expect(grid.getByRole("button", { name: "Week Warrior: 1/7" })).toBeVisible();
  await ctx.close();
});
