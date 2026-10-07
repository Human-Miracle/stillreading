-- The wider cover search (migration 0008's release) accepted results from loose searches without
-- checking they were the same book, so some books got another book's cover. Clear the covers it
-- found (bumping server_updated_at so every member's app drops them on its next pull) and look
-- again: the lookup now only accepts a result whose title and author match.
UPDATE "books" SET "cover_url" = NULL, "cover_lookup" = NULL, "cover_checked_at" = NULL, "server_updated_at" = now()
WHERE "cover_lookup" = 'found' AND "cover_checked_at" >= '2026-10-02 16:00:00+00';
