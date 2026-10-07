CREATE TABLE "replies" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"reading_session_id" text NOT NULL,
	"body" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reactions" DROP CONSTRAINT "reactions_type";--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_participant_id_challenge_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_reading_session_id_reading_sessions_id_fk" FOREIGN KEY ("reading_session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "replies_session_idx" ON "replies" USING btree ("reading_session_id");--> statement-breakpoint
CREATE INDEX "replies_participant_idx" ON "replies" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "replies_sync_idx" ON "replies" USING btree ("challenge_id","server_updated_at");--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_type" CHECK ("reactions"."type" in ('heart','fire','clap','laugh','book'));