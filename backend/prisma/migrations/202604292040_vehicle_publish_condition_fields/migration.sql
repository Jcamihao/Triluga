CREATE TYPE "KmPolicy" AS ENUM ('FREE', 'FIXED');
CREATE TYPE "MechanicsCondition" AS ENUM ('REVIEW', 'GOOD', 'EXCELLENT');

ALTER TABLE "Vehicle"
  ADD COLUMN "weeklyRate" DECIMAL(10,2),
  ADD COLUMN "kmPolicy" "KmPolicy" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "hasInsurance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mechanicsCondition" "MechanicsCondition",
  ADD COLUMN "hasDetranIssues" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trunkSize" INTEGER;
