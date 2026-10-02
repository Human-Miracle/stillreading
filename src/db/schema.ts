import { sql } from "drizzle-orm";
import {
  bigserial,
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
    /** Server-side cover lookup: null = not looked up yet, found / missing, or removed by the reader. */
    coverLookup: text("cover_lookup", { enum: ["found", "missing", "removed"] }),
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
    type: text("type", { enum: ["heart", "fire", "clap", "book"] }).notNull(),
    ...syncColumns,
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("reactions_unique_per_type_uq").on(t.participantId, t.readingSessionId, t.type),
    index("reactions_session_idx").on(t.readingSessionId),
    index("reactions_sync_idx").on(t.challengeId, t.serverUpdatedAt),
    check("reactions_type", sql`${t.type} in ('heart','fire','clap','book')`),
  ],
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
export type ReaderRow = typeof readers.$inferSelect;
