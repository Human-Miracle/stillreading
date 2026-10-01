import type { Metadata } from "next";
import { getDb } from "@/db/client";
import type { JoinPreview } from "@/lib/api-types";
import { joinCode } from "@/lib/validation/fields";
import { getJoinPreview } from "@/server/challenges";
import { JoinFlow } from "./join-flow";

type Props = { params: Promise<{ code: string }> };

async function loadPreview(code: string): Promise<JoinPreview | null> {
  if (!joinCode.safeParse(code).success) return null;
  try {
    return await getJoinPreview(await getDb(), code, null);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const preview = await loadPreview((await params).code);
  if (!preview) return { title: "Join a challenge", robots: { index: false } };
  const title = `Join ${preview.challenge.name}`;
  const description = `${preview.challenge.durationDays} days of reading together${preview.hostName ? `, started by ${preview.hostName}` : ""}. Everyone chooses their own goal and their own book.`;
  return { title, description, robots: { index: false }, openGraph: { title, description, type: "website" } };
}

export default async function JoinPage({ params }: Props) {
  const { code } = await params;
  return <JoinFlow code={code} initialPreview={await loadPreview(code)} />;
}
