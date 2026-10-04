import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Columns every synced table carries. */
const syncColumns = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  serverUpdatedAt: ts("server_updated_at").notNull().defaultNow(),
};

/**
 * A person, independent of device. Holds the Reading Pass lookup (scrypt of the pass, never the pass)
 * and the reader's note key wrapped with a key derived from the pass (the server cannot unwrap it).
 */
export const readers = pgTable(
  "readers",
  {
    id: text("id").primaryKey(),
    passLookup: text("pass_lookup"),
    passSetAt: ts("pass_set_at"),
    wrappedKey: text("wrapped_key"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("readers_pass_lookup_uq").on(t.passLookup)],
);

export const devices = pgTable(
  "devices",
  {
    id: text("id").primaryKey(),
    secretHash: text("secret_hash").notNull(),
    readerId: text("reader_id").references(() => readers.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [index("devices_reader_idx").on(t.readerId)],
);

export const challenges = pgTable(
  "challenges",
  {
    id: text("id").primaryKey(),
    publicJoinCode: text("public_join_code").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: varchar("description", { length: 500 }).notNull().default(""),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    durationDays: integer("duration_days").notNull(),
    timezone: text("timezone").notNull(),
    status: text("status", { enum: ["draft", "active", "completed", "archived"] }).notNull().default("active"),
    hostParticipantId: text("host_participant_id"),
    ...syncColumns,
  },
  (t) => [
    uniqueIndex("challenges_join_code_uq").on(t.publicJoinCode),
    check("challenges_date_range", sql`${t.endDate} >= ${t.startDate}`),
    check("challenges_duration", sql`${t.durationDays} between 1 and 365`),
    check("challenges_status", sql`${t.status} in ('draft','active','completed','archived')`),
  ],
);

export const participants = pgTable(
  "challenge_participants",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull().references(() => devices.id),
    readerId: text("reader_id").references(() => readers.id, { onDelete: "set null" }),
    displayName: varchar("display_name", { length: 40 }).notNull(),
    avatarUrl: text("avatar_url"),
    role: text("role", { enum: ["host", "participant"] }).notNull().default("participant"),
    status: text("status", { enum: ["active", "removed", "left"] }).notNull().default("active"),
    /** Push a notification to this member's devices when someone replies to their check-ins or threads. */
    notifyReplies: boolean("notify_replies").notNull().default(false),
    /** Push a nudge to log today's reading (only when notifications are on; see server/reminders). */
    notifyReminders: boolean("notify_reminders").notNull().default(true),
    lastRemindedAt: ts("last_reminded_at"),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    ...syncColumns,
  },
  (t) => [
    uniqueIndex("participants_challenge_device_uq").on(t.challengeId, t.deviceId),
    uniqueIndex("participants_challenge_reader_uq").on(t.challengeId, t.readerId),
    index("participants_reader_idx").on(t.readerId),
    index("participants_challenge_idx").on(t.challengeId),
    index("participants_device_idx").on(t.deviceId),
    index("participants_sync_idx").on(t.challengeId, t.serverUpdatedAt),
    check("participants_role", sql`${t.role} in ('host','participant')`),
    check("participants_status", sql`${t.status} in ('active','removed','left')`),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    priority: text("priority", { enum: ["primary", "secondary"] }).notNull().default("primary"),
    goalType: text("goal_type", { enum: ["daily", "total"] }).notNull(),
    targetUnit: text("target_unit", { enum: ["pages", "chapters", "minutes", "books", "days"] }).notNull(),
    targetValue: integer("target_value").notNull(),
    frequency: text("frequency", { enum: ["daily", "challenge"] }).notNull(),
    totalTarget: integer("total_target").notNull(),
    ...syncColumns,
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("goals_participant_priority_uq").on(t.participantId, t.priority),
    index("goals_participant_idx").on(t.participantId),
    index("goals_sync_idx").on(t.challengeId, t.serverUpdatedAt),
    check("goals_target_positive", sql`${t.targetValue} > 0 and ${t.totalTarget} > 0`),
    check("goals_unit", sql`${t.targetUnit} in ('pages','chapters','minutes','books','days')`),
  ],
);

export const books = pgTable(
  "books",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    author: varchar("author", { length: 120 }),
    coverUrl: text("cover_url"),
    /** Server-side cover lookup: null = not looked up yet, found / missing, or the reader removed / picked the cover. */
    coverLookup: text("cover_lookup", { enum: ["found", "missing", "removed", "picked"] }),
    coverCheckedAt: ts("cover_checked_at"),
    totalPages: integer("total_pages"),
    currentPage: integer("current_page").notNull().default(0),
    status: text("status", { enum: ["planned", "reading", "completed", "abandoned"] }).notNull().default("reading"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    ...syncColumns,
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("books_participant_idx").on(t.participantId),
    index("books_sync_idx").on(t.challengeId, t.serverUpdatedAt),
    check("books_pages", sql`${t.currentPage} >= 0 and (${t.totalPages} is null or ${t.totalPages} > 0)`),
  ],
);

export const readingSessions = pgTable(
  "reading_sessions",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    bookId: text("book_id").references(() => books.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    amount: integer("amount").notNull(),
    unit: text("unit", { enum: ["pages", "chapters", "minutes"] }).notNull(),
    /** Pages covered during a minutes or chapters check-in; null for pages check-ins (and older rows). */
    pages: integer("pages"),
    reflection: varchar("reflection", { length: 500 }),
    /** End-to-end encrypted private reflection ("v1.<iv>.<ciphertext>"); only ever sent to its owner. */
    privateReflection: text("private_reflection"),
    ...syncColumns,
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("sessions_challenge_date_idx").on(t.challengeId, t.date),
    index("sessions_participant_idx").on(t.participantId),
    index("sessions_book_idx").on(t.bookId),
    index("sessions_sync_idx").on(t.challengeId, t.serverUpdatedAt),
    check("sessions_amount_positive", sql`${t.amount} > 0`),
    check("sessions_unit", sql`${t.unit} in ('pages','chapters','minutes')`),
    check("sessions_pages", sql`${t.pages} is null or (${t.pages} > 0 and ${t.unit} <> 'pages')`),
  ],
);

export const reactions = pgTable(
  "reactions",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    readingSessionId: text("reading_session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["heart", "fire", "clap", "laugh", "book"] }).notNull(),
    ...syncColumns,
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("reactions_unique_per_type_uq").on(t.participantId, t.readingSessionId, t.type),
    index("reactions_session_idx").on(t.readingSessionId),
    index("reactions_sync_idx").on(t.challengeId, t.serverUpdatedAt),
    check("reactions_type", sql`${t.type} in ('heart','fire','clap','laugh','book')`),
  ],
);

/** Replies on a check-in, shown as a thread under it. */
export const replies = pgTable(
  "replies",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    readingSessionId: text("reading_session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
    body: varchar("body", { length: 500 }).notNull(),
    /** Top-level reply this one answers (one level deep, like Instagram); null for replies to the check-in. */
    parentId: text("parent_id"),
    /** Set once notifications for this reply have been sent, so retries never notify twice. */
    notifiedAt: ts("notified_at"),
    ...syncColumns,
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("replies_session_idx").on(t.readingSessionId),
    index("replies_parent_idx").on(t.parentId),
    index("replies_participant_idx").on(t.participantId),
    index("replies_sync_idx").on(t.challengeId, t.serverUpdatedAt),
  ],
);

/** ♥ on a reply. Unique per (participant, reply), so the id is derived; toggling reuses the row. */
export const replyLikes = pgTable(
  "reply_likes",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    replyId: text("reply_id").notNull().references(() => replies.id, { onDelete: "cascade" }),
    ...syncColumns,
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("reply_likes_unique_uq").on(t.participantId, t.replyId),
    index("reply_likes_reply_idx").on(t.replyId),
    index("reply_likes_sync_idx").on(t.challengeId, t.serverUpdatedAt),
  ],
);

/**
 * Web Push addresses, one per browser/app install. Notifications go to every subscription of the
 * member's device, or of any device belonging to the same reader (Reading Pass).
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    /** Outcome of the last notification sent here (sent / failed), with the push service's reason. */
    lastResult: text("last_result"),
    lastStatus: integer("last_status"),
    lastDetail: text("last_detail"),
    lastSentAt: ts("last_sent_at"),
  },
  (t) => [index("push_subscriptions_device_idx").on(t.deviceId)],
);

/** One-time links a host creates so a member who lost everything can reconnect. */
export const reinvites = pgTable("reinvites", {
  tokenHash: text("token_hash").primaryKey(),
  participantId: text("participant_id")
    .notNull()
    .references(() => participants.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/**
 * Browser → installed app handoff: an encrypted blob (the Reading Pass, sealed with a key that only
 * travels in the copied link's fragment), single use and short-lived. The server can't read it.
 */
export const handoffs = pgTable("handoffs", {
  tokenHash: text("token_hash").primaryKey(),
  blob: text("blob").notNull(),
  createdBy: text("created_by").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const processedOperations = pgTable("processed_operations", {
  opId: text("op_id").primaryKey(),
  deviceId: text("device_id").notNull(),
  opType: text("op_type").notNull(),
  result: jsonb("result"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const productEvents = pgTable(
  "product_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    challengeId: text("challenge_id"),
    props: jsonb("props"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("product_events_name_idx").on(t.name, t.createdAt)],
);

export type ChallengeRow = typeof challenges.$inferSelect;
export type ParticipantRow = typeof participants.$inferSelect;
export type GoalRow = typeof goals.$inferSelect;
export type BookRow = typeof books.$inferSelect;
export type SessionRow = typeof readingSessions.$inferSelect;
export type ReactionRow = typeof reactions.$inferSelect;
export type ReplyRow = typeof replies.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type ReplyLikeRow = typeof replyLikes.$inferSelect;
export type ReaderRow = typeof readers.$inferSelect;

/**
 * A badge a reader chose to save or share. The snapshot keeps the card's details as they were when
 * it was earned. Only `public` shares get a page anyone can open (and link previews); the id is
 * unguessable, so the card image itself can be fetched with just the id.
 */
export const badgeShares = pgTable(
  "badge_shares",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    badgeId: text("badge_id").notNull(),
    level: integer("level").notNull(),
    public: boolean("public").notNull().default(false),
    snapshot: jsonb("snapshot").$type<BadgeSnapshot>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("badge_shares_participant_badge_uq").on(t.participantId, t.badgeId, t.level)],
);

export interface BadgeSnapshot {
  name: string;
  displayName: string;
  challengeName: string;
  stat: string | null;
  earnedOn: string | null;
  dayNumber: number | null;
  durationDays: number;
  count: number;
  holders: number;
  readers: number;
}

export type BadgeShareRow = typeof badgeShares.$inferSelect;
