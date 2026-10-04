CREATE TABLE "badge_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"level" integer NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "badge_shares" ADD CONSTRAINT "badge_shares_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_shares" ADD CONSTRAINT "badge_shares_participant_id_challenge_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "badge_shares_participant_badge_uq" ON "badge_shares" USING btree ("participant_id","badge_id","level");