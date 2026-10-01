CREATE TABLE "readers" (
	"id" text PRIMARY KEY NOT NULL,
	"pass_lookup" text,
	"pass_set_at" timestamp with time zone,
	"wrapped_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reinvites" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "reader_id" text;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD COLUMN "reader_id" text;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD COLUMN "private_reflection" text;--> statement-breakpoint
ALTER TABLE "reinvites" ADD CONSTRAINT "reinvites_participant_id_challenge_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "readers_pass_lookup_uq" ON "readers" USING btree ("pass_lookup");--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_reader_idx" ON "devices" USING btree ("reader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_challenge_reader_uq" ON "challenge_participants" USING btree ("challenge_id","reader_id");--> statement-breakpoint
CREATE INDEX "participants_reader_idx" ON "challenge_participants" USING btree ("reader_id");