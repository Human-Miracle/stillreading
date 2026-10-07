import { expect, test } from "@playwright/test";
import { addDays } from "@/lib/domain/dates";
import { createChallenge, join, newContext, waitForSynced } from "./helpers";

const SHOTS = process.env.E2E_SCREENSHOTS;

test("Day One window: host opens it once, a member logs Day 1 and earns the badge", async ({ browser }) => {
  const hostCtx = await newContext(browser);
  const host = await hostCtx.newPage();
  const today = await host.evaluate(() => new Intl.DateTimeFormat("en-CA").format(new Date()));
  const { inviteUrl, challengeUrl } = await createChallenge(host, { name: "Day One Challenge", host: "Jessica", startDate: addDays(today, -11) });

  const friendCtx = await newContext(browser);
  const friend = await friendCtx.newPage();
  await join(friend, inviteUrl, "David", { book: "Deep Work" });
  await expect(friend.getByRole("button", { name: "Log Day 1 reading" })).toHaveCount(0);

  await host.goto(`${challengeUrl}/settings`);
  await host.getByRole("button", { name: "Open Day One window" }).click();
  await host.getByRole("button", { name: "Start 3-minute window" }).click();
  await expect(host.getByText(/Open now: \d:\d\d left/)).toBeVisible();
  if (SHOTS) await host.getByText("Day One badge", { exact: true }).locator("..").screenshot({ path: `${SHOTS}/host-card.png` });

  await friend.reload();
  const banner = friend.getByRole("button", { name: "Log Day 1 reading" });
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(friend.getByTestId("day-one-countdown")).toHaveText(/^[0-3]:\d\d$/);
  if (SHOTS) await friend.screenshot({ path: `${SHOTS}/member-home.png` });
  await banner.click();

  const dialog = friend.getByRole("dialog", { name: "Log reading" });
  await expect(dialog.getByRole("radio", { name: "Day 1" })).toHaveAttribute("aria-checked", "true");
  await dialog.getByLabel("How much?").fill("15");
  if (SHOTS) await friend.screenshot({ path: `${SHOTS}/composer.png` });
  await dialog.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(dialog.getByText("Day 1 is in. The Day One badge is yours.")).toBeVisible();
  if (SHOTS) await friend.screenshot({ path: `${SHOTS}/success.png` });
  await dialog.getByRole("button", { name: "Done" }).click();
  await waitForSynced(friend);

  // It earns the Day One badge, and the host can't open the window again.
  await friend.goto(`${challengeUrl}/me?tab=badges`);
  await expect(friend.getByRole("list", { name: "Your badges" }).getByRole("button", { name: "Day One: Earned" })).toBeVisible();
  if (SHOTS) await friend.screenshot({ path: `${SHOTS}/badges.png` });
  await host.goto(`${challengeUrl}/settings`);
  await expect(host.getByText(/1 of 2 readers have the badge/)).toBeVisible({ timeout: 30_000 });
  await expect(host.getByRole("button", { name: "Open Day One window" })).toHaveCount(0);

  await hostCtx.close();
  await friendCtx.close();
});
