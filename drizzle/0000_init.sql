CREATE TABLE "books" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"title" varchar(200) NOT NULL,
	"author" varchar(120),
	"cover_url" text,
	"total_pages" integer,
	"current_page" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'reading' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "books_pages" CHECK ("books"."current_page" >= 0 and ("books"."total_pages" is null or "books"."total_pages" > 0))
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"public_join_code" text NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"duration_days" integer NOT NULL,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"host_participant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_date_range" CHECK ("challenges"."end_date" >= "challenges"."start_date"),
	CONSTRAINT "challenges_duration" CHECK ("challenges"."duration_days" between 1 and 365),
	CONSTRAINT "challenges_status" CHECK ("challenges"."status" in ('draft','active','completed','archived'))
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"priority" text DEFAULT 'primary' NOT NULL,
	"goal_type" text NOT NULL,
	"target_unit" text NOT NULL,
	"target_value" integer NOT NULL,
	"frequency" text NOT NULL,
	"total_target" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "goals_target_positive" CHECK ("goals"."target_value" > 0 and "goals"."total_target" > 0),
	CONSTRAINT "goals_unit" CHECK ("goals"."target_unit" in ('pages','chapters','minutes','books','days'))
);
--> statement-breakpoint
CREATE TABLE "challenge_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"device_id" text NOT NULL,
	"display_name" varchar(40) NOT NULL,
	"avatar_url" text,
	"role" text DEFAULT 'participant' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_role" CHECK ("challenge_participants"."role" in ('host','participant')),
	CONSTRAINT "participants_status" CHECK ("challenge_participants"."status" in ('active','removed','left'))
);
--> statement-breakpoint
CREATE TABLE "processed_operations" (
	"op_id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"op_type" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"challenge_id" text,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"reading_session_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reactions_type" CHECK ("reactions"."type" in ('heart','fire','clap','book'))
);
--> statement-breakpoint
CREATE TABLE "reading_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"book_id" text,
	"date" date NOT NULL,
	"amount" integer NOT NULL,
	"unit" text NOT NULL,
	"reflection" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sessions_amount_positive" CHECK ("reading_sessions"."amount" > 0),
	CONSTRAINT "sessions_unit" CHECK ("reading_sessions"."unit" in ('pages','chapters','minutes'))
);
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_participant_id_challenge_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_participant_id_challenge_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_participant_id_challenge_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_reading_session_id_reading_sessions_id_fk" FOREIGN KEY ("reading_session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_participant_id_challenge_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "books_participant_idx" ON "books" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "books_sync_idx" ON "books" USING btree ("challenge_id","server_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_join_code_uq" ON "challenges" USING btree ("public_join_code");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_participant_priority_uq" ON "goals" USING btree ("participant_id","priority");--> statement-breakpoint
CREATE INDEX "goals_participant_idx" ON "goals" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "goals_sync_idx" ON "goals" USING btree ("challenge_id","server_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_challenge_device_uq" ON "challenge_participants" USING btree ("challenge_id","device_id");--> statement-breakpoint
CREATE INDEX "participants_challenge_idx" ON "challenge_participants" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "participants_device_idx" ON "challenge_participants" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "participants_sync_idx" ON "challenge_participants" USING btree ("challenge_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "product_events_name_idx" ON "product_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_unique_per_type_uq" ON "reactions" USING btree ("participant_id","reading_session_id","type");--> statement-breakpoint
CREATE INDEX "reactions_session_idx" ON "reactions" USING btree ("reading_session_id");--> statement-breakpoint
CREATE INDEX "reactions_sync_idx" ON "reactions" USING btree ("challenge_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "sessions_challenge_date_idx" ON "reading_sessions" USING btree ("challenge_id","date");--> statement-breakpoint
CREATE INDEX "sessions_participant_idx" ON "reading_sessions" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "sessions_book_idx" ON "reading_sessions" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "sessions_sync_idx" ON "reading_sessions" USING btree ("challenge_id","server_updated_at");