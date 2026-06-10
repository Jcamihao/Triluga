-- Add slug column, backfill with id, then enforce NOT NULL + UNIQUE
ALTER TABLE "Vehicle" ADD COLUMN "slug" TEXT;
UPDATE "Vehicle" SET "slug" = "id" WHERE "slug" IS NULL;
ALTER TABLE "Vehicle" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Vehicle_slug_key" ON "Vehicle"("slug");
