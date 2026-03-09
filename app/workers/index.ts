// app/workers/index.ts
// Run this as a separate process: tsx app/workers/index.ts
import { Worker, type Job } from "bullmq";
import { connection, QUEUE_NAMES } from "~/lib/queue/queues.server";
import type { InvoiceJobData, EhfSendJobData, EmailSendJobData, AccountingSyncJobData } from "~/lib/queue/queues.server";
import { db } from "~/db.server";
import { buildInvoiceFromOrder, sendInvoice } from "~/lib/invoice.server";
import { getFikenProvider } from "~/lib/accounting/fiken.server";
import { oreToNok } from "~/lib/validators";
import { logger } from "~/lib/logger.server";
import { getCurrentMonthKey } from "~/lib/validators";

logger.info("Starting Nokto EHF workers...");

// --- Invoice creation worker ---
const invoiceWorker = new Worker<InvoiceJobData>(
  QUEUE_NAMES.INVOICE,
  async (job: Job<InvoiceJobData>) => {
    const { shopId, shopifyOrderId, shopifyOrderName } = job.data;
    const log = logger.child({ jobId: job.id, shopId, shopifyOrderId });

    const shop = await db.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new Error("Shop not found");

    // Check if invoice already exists
    const existing = await db.invoice.findFirst({ where: { shopId, shopifyOrderId } });
    if (existing) {
      log.info("Invoice already exists – skipping");
      return;
    }

    // Fetch order from Shopify Admin API
    // Note: in workers we don't have the admin context, so we use REST
    const accessToken = shop.accessToken; // already encrypted – need to decrypt
    const { decrypt } = await import("~/lib/crypto.server");
    const token = await decrypt(accessToken);

    const numericId = shopifyOrderId.replace(/\D/g, "");
    const apiUrl = `https://${shop.shopDomain}/admin/api/2025-01/orders/${numericId}.json`;
    const res = await fetch(apiUrl, {
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    });

    if (!res.ok) throw new Error(`Shopify order fetch failed: ${res.status}`);

    const orderData = ((await res.json()) as { order: ShopifyRestOrder }).order;
    const customerId = orderData.customer
      ? `gid://shopify/Customer/${orderData.customer.id}`
      : null;

    if (!customerId) {
      log.info("Order has no customer – skipping");
      return;
    }

    const b2bCustomer = await db.b2bCustomer.findFirst({
      where: { shopId, shopifyCustomerId: customerId },
    });

    if (!b2bCustomer) {
      log.info({ customerId }, "skipped_missing_b2b_profile");
      return;
    }

    const mappedOrder = {
      id: shopifyOrderId,
      name: shopifyOrderName,
      financialStatus: orderData.financial_status,
      lineItems: orderData.line_items.map((li) => ({
        id: `gid://shopify/LineItem/${li.id}`,
        title: li.title,
        variantTitle: li.variant_title,
        quantity: li.quantity,
        price: li.price,
      })),
      shippingLines: orderData.shipping_lines?.map((sl) => ({
        title: sl.title,
        price: sl.price,
      })) ?? [],
    };

    const invoiceId = await buildInvoiceFromOrder({
      shopId,
      shop,
      b2bCustomer,
      shopifyOrderId,
      shopifyOrderName,
      orderData: mappedOrder,
    });

    log.info({ invoiceId }, "Invoice created via worker");

    // Auto-send
    await sendInvoice(invoiceId);
  },
  { connection, concurrency: 5 }
);

// --- EHF send worker ---
const ehfWorker = new Worker<EhfSendJobData>(
  QUEUE_NAMES.EHF_SEND,
  async (job: Job<EhfSendJobData>) => {
    const { invoiceId } = job.data;
    await sendInvoice(invoiceId);
  },
  { connection, concurrency: 3 }
);

// --- Email send worker ---
const emailWorker = new Worker<EmailSendJobData>(
  QUEUE_NAMES.EMAIL_SEND,
  async (job: Job<EmailSendJobData>) => {
    const { invoiceId } = job.data;
    await sendInvoice(invoiceId);
  },
  { connection, concurrency: 5 }
);

// --- Accounting sync worker ---
const accountingWorker = new Worker<AccountingSyncJobData>(
  QUEUE_NAMES.ACCOUNTING_SYNC,
  async (job: Job<AccountingSyncJobData>) => {
    const { shopId, invoiceId, operation } = job.data;
    const log = logger.child({ jobId: job.id, shopId, invoiceId, operation });

    const fiken = await getFikenProvider(shopId);
    if (!fiken) {
      log.info("No Fiken integration – skipping sync");
      return;
    }

    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: { lines: true, b2bCustomer: true },
    });

    if (!invoice || !invoice.b2bCustomer) {
      log.warn("Invoice or customer not found for sync");
      return;
    }

    if (operation === "customer" || operation === "invoice") {
      const customerId = await fiken.syncCustomer({
        id: invoice.b2bCustomer.id,
        name: invoice.b2bCustomer.companyName,
        orgNr: invoice.b2bCustomer.orgNr,
        email: invoice.b2bCustomer.invoiceEmail,
      });

      const fikenInvoiceId = await fiken.syncInvoice({
        externalId: invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        customerExternalId: customerId,
        currency: invoice.currency,
        lines: invoice.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPriceOre / 100,
          vatRate: l.vatRate,
        })),
        totalAmountNok: invoice.totalOre / 100,
        vatAmountNok: invoice.vatOre / 100,
      });

      await db.invoice.update({
        where: { id: invoiceId },
        data: { fikenSaleId: fikenInvoiceId, fikenSyncedAt: new Date() },
      });

      log.info({ fikenInvoiceId }, "Fiken sync complete");
    }
  },
  { connection, concurrency: 2 }
);

// --- Billing reset (repeatable) ---
// This is scheduled monthly – triggered by a repeatable job setup
const billingResetWorker = new Worker(
  QUEUE_NAMES.BILLING_RESET,
  async (job: Job) => {
    const monthKey = getCurrentMonthKey();
    logger.info({ monthKey }, "Running billing monthly reset");

    const result = await db.shop.updateMany({
      where: { isActive: true, billingMonthYear: { not: monthKey } },
      data: { ehfSentThisMonth: 0, billingMonthYear: monthKey },
    });

    logger.info({ updated: result.count }, "Billing counters reset");
  },
  { connection }
);

// --- Cleanup worker ---
const cleanupWorker = new Worker(
  QUEUE_NAMES.CLEANUP,
  async (job: Job) => {
    const now = new Date();

    // Delete expired webhook events
    const webhookResult = await db.webhookEvent.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    // Delete expired audit logs
    const auditResult = await db.auditLog.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    logger.info(
      { webhookDeleted: webhookResult.count, auditDeleted: auditResult.count },
      "Cleanup complete"
    );
  },
  { connection }
);

// Error handlers
[invoiceWorker, ehfWorker, emailWorker, accountingWorker, billingResetWorker, cleanupWorker].forEach((w) => {
  w.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, queue: w.name, err: err.message }, "Job failed");
  });
  w.on("completed", (job) => {
    logger.debug({ jobId: job.id, queue: w.name }, "Job completed");
  });
});

// Schedule repeatable jobs
async function scheduleRepeatableJobs() {
  const { getQueue } = await import("~/lib/queue/queues.server");

  const billingQueue = getQueue(QUEUE_NAMES.BILLING_RESET);
  await billingQueue.add(
    "monthly-reset",
    {},
    { repeat: { pattern: "0 0 1 * *" } } // 1st of every month at midnight
  );

  const cleanupQueue = getQueue(QUEUE_NAMES.CLEANUP);
  await cleanupQueue.add(
    "daily-cleanup",
    {},
    { repeat: { pattern: "0 3 * * *" } } // every day at 3am
  );

  logger.info("Repeatable jobs scheduled");
}

scheduleRepeatableJobs().catch(logger.error.bind(logger));

logger.info("All workers running");

// Graceful shutdown
process.on("SIGTERM", async () => {
  await Promise.all([
    invoiceWorker.close(),
    ehfWorker.close(),
    emailWorker.close(),
    accountingWorker.close(),
    billingResetWorker.close(),
    cleanupWorker.close(),
  ]);
  process.exit(0);
});

// Types
interface ShopifyRestOrder {
  id: number;
  name: string;
  financial_status: string;
  customer?: { id: number };
  line_items: Array<{
    id: number;
    title: string;
    variant_title?: string;
    quantity: number;
    price: string;
  }>;
  shipping_lines?: Array<{ title: string; price: string }>;
}
