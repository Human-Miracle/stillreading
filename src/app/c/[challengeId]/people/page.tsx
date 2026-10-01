"use client";
import { useState } from "react";
import { useChallenge } from "@/components/challenge/context";
import { Hero } from "@/components/challenge/hero";
import { CrewList } from "@/components/people/crew-list";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { PageSheet } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/misc";
import { CountTabs } from "@/components/ui/segmented";

type Filter = "all" | "in" | "not";

export default function PeoplePage() {
  const { view } = useChallenge();
  const [filter, setFilter] = useState<Filter>("all");
  const members = [...view.members].sort((a, b) => a.participant.joinedAt.localeCompare(b.participant.joinedAt));
  const checkedIn = members.filter((m) => m.progress.today.read);
  const notYet = members.filter((m) => !m.progress.today.read);
  const shown = filter === "in" ? checkedIn : filter === "not" ? notYet : members;

  return (
    <>
      <Hero tone="sky" title="People" subtitle={view.challenge.name} back={{ href: `/c/${view.challenge.id}`, label: "Back to challenge" }} className="pb-14">
        <div className="px-5 pt-8">
          <div className="flex items-center justify-between">
          <div className="flex -space-x-2.5" aria-hidden>
            {members.slice(0, 6).map((m) => (
              <Avatar key={m.participant.id} name={m.participant.displayName} id={m.participant.id} size="sm" className="ring-2 ring-[#cddcf5]" />
            ))}
          </div>
            <ButtonLink href={`/c/${view.challenge.id}/leaderboard`} size="sm">
              <Icon.trophy className="size-4" /> Leaderboard
            </ButtonLink>
          </div>
          <h1 className="display mt-5 text-[52px]">
            {view.stats.participantCount} {view.stats.participantCount === 1 ? "reader" : "readers"},
            <br />
            <span className="text-ink/40">{view.stats.checkedInToday} showed up today</span>
          </h1>
          <div className="mt-8">
            <CountTabs
              label="Filter readers"
              value={filter}
              onChange={setFilter}
              tabs={[
                { value: "all", label: "All", count: members.length },
                { value: "in", label: "Checked in", count: checkedIn.length },
                { value: "not", label: "Not yet", count: notYet.length },
              ]}
            />
          </div>
        </div>
      </Hero>
      <PageSheet>
        {shown.length ? (
          <CrewList members={shown} challengeId={view.challenge.id} myId={view.challenge.myParticipantId} detail="days" />
        ) : (
          <EmptyState title={filter === "not" ? "Everyone has checked in today" : "No check-ins yet today"}>{filter === "not" ? "What a crew. 📚" : "Be the first."}</EmptyState>
        )}
      </PageSheet>
    </>
  );
}
