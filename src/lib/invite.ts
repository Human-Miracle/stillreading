import { track } from "@/lib/analytics";
import { inviteUrl } from "@/lib/format";

/** Native share sheet when available, clipboard otherwise. Returns what happened. */
export async function shareInvite(c: { joinCode: string; name: string; id: string }): Promise<"shared" | "copied" | "cancelled"> {
  const url = inviteUrl(c.joinCode);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: c.name, text: `Join me for ${c.name} 📚 Read whatever you want, set your own goal, and let's show up together.`, url });
      track("invite_link_copied", { challengeId: c.id, props: { via: "share" } });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt("Copy this invite link", url);
  }
  track("invite_link_copied", { challengeId: c.id });
  return "copied";
}
