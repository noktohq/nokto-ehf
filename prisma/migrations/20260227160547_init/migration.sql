-- CreateEnum
CREATE TYPE "InvoiceMode" AS ENUM ('AUTO_ON_PAID', 'MANUAL');

-- CreateEnum
CREATE TYPE "KidFormat" AS ENUM ('NONE', 'KID10', 'KID15');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'READY', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "planName" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "senderCompany" TEXT NOT NULL DEFAULT '',
    "senderOrgNr" TEXT NOT NULL DEFAULT '',
    "senderVatNr" TEXT NOT NULL DEFAULT '',
    "senderAddress" TEXT NOT NULL DEFAULT '',
    "senderZip" TEXT NOT NULL DEFAULT '',
    "senderCity" TEXT NOT NULL DEFAULT '',
    "senderCountry" TEXT NOT NULL DEFAULT 'NO',
    "senderEmail" TEXT NOT NULL DEFAULT '',
    "senderPhone" TEXT NOT NULL DEFAULT '',
    "senderBankAccount" TEXT NOT NULL DEFAULT '',
    "senderIBAN" TEXT NOT NULL DEFAULT '',
    "senderBIC" TEXT NOT NULL DEFAULT '',
    "peppolParticipantId" TEXT NOT NULL DEFAULT '',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "invoiceStartNumber" INTEGER NOT NULL DEFAULT 1,
    "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 14,
    "invoiceMode" "InvoiceMode" NOT NULL DEFAULT 'MANUAL',
    "defaultSendEmail" BOOLEAN NOT NULL DEFAULT true,
    "defaultSendEhf" BOOLEAN NOT NULL DEFAULT false,
    "ehfCustomizationId" TEXT NOT NULL DEFAULT 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
    "ehfProfileId" TEXT NOT NULL DEFAULT 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    "peppolProviderApiUrl" TEXT NOT NULL DEFAULT '',
    "peppolProviderApiKey" TEXT NOT NULL DEFAULT '',
    "peppolProviderSenderId" TEXT NOT NULL DEFAULT '',
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpPass" TEXT NOT NULL DEFAULT '',
    "smtpFrom" TEXT NOT NULL DEFAULT '',
    "subscriptionId" TEXT,
    "subscriptionStatus" TEXT DEFAULT 'pending',
    "trialEndsAt" TIMESTAMP(3),
    "billingPlanActive" BOOLEAN NOT NULL DEFAULT false,
    "ehfSentThisMonth" INTEGER NOT NULL DEFAULT 0,
    "billingMonthYear" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2BCustomer" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "orgNr" TEXT NOT NULL,
    "invoiceEmail" TEXT NOT NULL,
    "peppolParticipantId" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 14,
    "kidFormat" "KidFormat" NOT NULL DEFAULT 'NONE',
    "sendEmail" BOOLEAN NOT NULL DEFAULT true,
    "sendEhf" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "b2bCustomerId" TEXT,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'NOK',
    "kidNumber" TEXT,
    "subtotalOre" INTEGER NOT NULL DEFAULT 0,
    "vatOre" INTEGER NOT NULL DEFAULT 0,
    "totalOre" INTEGER NOT NULL DEFAULT 0,
    "orderDataJson" JSONB NOT NULL,
    "buyerDataJson" JSONB NOT NULL,
    "pdfPath" TEXT,
    "ehfXmlPath" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "ehfSentAt" TIMESTAMP(3),
    "emailError" TEXT,
    "ehfError" TEXT,
    "ehfProviderRef" TEXT,
    "fikenSaleId" TEXT,
    "fikenSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineNum" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceOre" INTEGER NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "vatOre" INTEGER NOT NULL,
    "lineNetOre" INTEGER NOT NULL,
    "lineTotalOre" INTEGER NOT NULL,
    "shopifyLineItemId" TEXT,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "shopId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "actorId" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FikenIntegration" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "companySlug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FikenIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "B2BCustomer_shopId_idx" ON "B2BCustomer"("shopId");

-- CreateIndex
CREATE INDEX "B2BCustomer_orgNr_idx" ON "B2BCustomer"("orgNr");

-- CreateIndex
CREATE UNIQUE INDEX "B2BCustomer_shopId_shopifyCustomerId_key" ON "B2BCustomer"("shopId", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "Invoice_shopId_status_idx" ON "Invoice"("shopId", "status");

-- CreateIndex
CREATE INDEX "Invoice_shopId_shopifyOrderId_idx" ON "Invoice"("shopId", "shopifyOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shopId_invoiceNumber_key" ON "Invoice"("shopId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "WebhookEvent_shopId_status_idx" ON "WebhookEvent"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_shopId_shopifyId_key" ON "WebhookEvent"("shopId", "shopifyId");

-- CreateIndex
CREATE INDEX "AuditLog_shopId_action_idx" ON "AuditLog"("shopId", "action");

-- CreateIndex
CREATE INDEX "AuditLog_shopId_entityType_entityId_idx" ON "AuditLog"("shopId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FikenIntegration_shopId_key" ON "FikenIntegration"("shopId");

-- AddForeignKey
ALTER TABLE "B2BCustomer" ADD CONSTRAINT "B2BCustomer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_b2bCustomerId_fkey" FOREIGN KEY ("b2bCustomerId") REFERENCES "B2BCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FikenIntegration" ADD CONSTRAINT "FikenIntegration_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
