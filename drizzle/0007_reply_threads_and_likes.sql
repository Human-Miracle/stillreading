CREATE TABLE "reply_likes" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"reply_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "reply_likes" ADD CONSTRAINT "reply_likes_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_likes" ADD CONSTRAINT "reply_likes_participant_id_challenge_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_likes" ADD CONSTRAINT "reply_likes_reply_id_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reply_likes_unique_uq" ON "reply_likes" USING btree ("participant_id","reply_id");--> statement-breakpoint
CREATE INDEX "reply_likes_reply_idx" ON "reply_likes" USING btree ("reply_id");--> statement-breakpoint
CREATE INDEX "reply_likes_sync_idx" ON "reply_likes" USING btree ("challenge_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "replies_parent_idx" ON "replies" USING btree ("parent_id");