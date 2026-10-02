-- The cover search got wider (keyword search, subtitles, more results): look again for every book
-- that came up empty under the old search, instead of waiting for its retry date.
UPDATE "books" SET "cover_lookup" = NULL, "cover_checked_at" = NULL WHERE "cover_lookup" = 'missing' AND "cover_url" IS NULL;
