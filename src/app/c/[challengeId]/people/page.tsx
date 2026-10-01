"use client";
import Link from "next/link";
import { useChallenge } from "@/components/challenge/context";
import { ParticipantCard } from "@/components/people/participant-card";

export default function PeoplePage() {
  const { view } = useChallenge();
  const members = [...view.members].sort((a, b) => a.participant.joinedAt.localeCompare(b.participant.joinedAt));
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-semibold">People</h1>
        <div className="flex gap-4">
          <Link href={`/c/${view.challenge.id}/leaderboard`} className="text-sm font-semibold text-accent">
            Leaderboard →
          </Link>
          <Link href={`/c/${view.challenge.id}/stats`} className="text-sm font-semibold text-accent">
            Stats →
          </Link>
        </div>
      </div>
      <p className="text-ink-2">
        {view.stats.checkedInToday} of {view.stats.participantCount} checked in today
      </p>
      <ul className="space-y-2.5">
        {members.map((m) => (
          <ParticipantCard key={m.participant.id} member={m} challengeId={view.challenge.id} isMe={m.participant.id === view.challenge.myParticipantId} detailed />
        ))}
      </ul>
    </div>
  );
}
