-- Remove identity verification (KYC) feature: selfie, document (RG/CPF) and
-- CNH upload/AI verification. documentNumber/driverLicenseNumber (plain
-- identity numbers, no files/AI involved) are intentionally kept.

-- AlterTable
ALTER TABLE "Profile" DROP COLUMN "cnhOcrText",
DROP COLUMN "documentImageUrl",
DROP COLUMN "documentOcrText",
DROP COLUMN "documentVerificationStatus",
DROP COLUMN "driverLicenseImageUrl",
DROP COLUMN "driverLicenseVerification",
DROP COLUMN "selfieImageUrl";

-- DropEnum
DROP TYPE "VerificationStatus";

-- NOTE: NotificationType.DOCUMENT_APPROVED/DOCUMENT_REJECTED were removed
-- from schema.prisma (dead values, never instantiated by any code path) but
-- are intentionally NOT dropped from the Postgres enum here — removing an
-- enum value in Postgres requires rebuilding the type and is not worth the
-- risk for values that are simply unused going forward.
