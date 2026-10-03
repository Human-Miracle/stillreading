ALTER TABLE "push_subscriptions" ADD COLUMN "last_result" text;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "last_status" integer;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "last_detail" text;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "last_sent_at" timestamp with time zone;