-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('PROFESSIONAL', 'FLEET');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('ASAAS', 'GRANT');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "plan" "BillingPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "source" "SubscriptionSource" NOT NULL,
    "interval" "BillingInterval",
    "currentPeriodEnd" TIMESTAMP(3),
    "pastDueSince" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "asaasCheckoutId" TEXT,
    "asaasCheckoutLink" TEXT,
    "asaasSubscriptionId" TEXT,
    "asaasCustomerId" TEXT,
    "latestInvoiceUrl" TEXT,
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ASAAS',
    "externalEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_asaasCheckoutId_key" ON "Subscription"("asaasCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_asaasSubscriptionId_key" ON "Subscription"("asaasSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_ownerUserId_status_idx" ON "Subscription"("ownerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_externalEventId_key" ON "BillingEvent"("externalEventId");

-- CreateIndex
CREATE INDEX "BillingEvent_type_createdAt_idx" ON "BillingEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
