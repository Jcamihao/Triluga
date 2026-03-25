-- AlterTable
ALTER TABLE "Vehicle"
ADD COLUMN IF NOT EXISTS "weekendSurchargePercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "holidaySurchargePercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "highDemandSurchargePercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "advanceBookingDiscountPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "advanceBookingDaysThreshold" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SearchAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "filters" JSONB NOT NULL,
    "queryHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchAlert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SearchAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SearchAlertMatch" (
    "id" TEXT NOT NULL,
    "searchAlertId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchAlertMatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SearchAlertMatch_searchAlertId_fkey" FOREIGN KEY ("searchAlertId") REFERENCES "SearchAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SearchAlertMatch_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SearchAlert_userId_queryHash_key"
ON "SearchAlert"("userId", "queryHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchAlert_userId_isActive_idx"
ON "SearchAlert"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SearchAlertMatch_searchAlertId_vehicleId_key"
ON "SearchAlertMatch"("searchAlertId", "vehicleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchAlertMatch_vehicleId_notifiedAt_idx"
ON "SearchAlertMatch"("vehicleId", "notifiedAt");
