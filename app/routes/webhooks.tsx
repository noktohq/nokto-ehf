// app/routes/webhooks.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { logger } from "~/lib/logger.server";
import { invoiceQueue } from "~/lib/queue/queues.server";
import { v4 as uuidv4 } from "uuid";

const RETENTION_DAYS = parseInt(process.env.RETENTION_WEBHOOK_LOGS ?? "90", 10);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, payload, admin } = await authenticate.webhook(request);
  const requestId = uuidv4();
  const log = logger.child({ topic, shop, requestId });

  const shopifyWebhookId = request.headers.get("X-Shopify-Webhook-Id") ?? uuidv4();

  // Find shop record
  const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });
  if (!shopRecord) {
    log.warn("Shop not found for webhook");
    return new Response("Shop not found", { status: 404 });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + RETENTION_DAYS);

  // Idempotency check
  const existing = await db.webhookEvent.findUnique({
    where: { shopId_shopifyId: { shopId: shopRecord.id, shopifyId: shopifyWebhookId } },
  });

  if (existing && (existing.status === "DONE" || existing.status === "PROCESSING")) {
    log.info({ shopifyWebhookId }, "Webhook already processed – skipping");
    return new Response("OK", { status: 200 });
  }

  // Upsert webhook event
  const event = await db.webhookEvent.upsert({
    where: { shopId_shopifyId: { shopId: shopRecord.id, shopifyId: shopifyWebhookId } },
    update: { status: "PROCESSING", attempts: { increment: 1 } },
    create: {
      shopId: shopRecord.id,
      topic,
      shopifyId: shopifyWebhookId,
      payload: payload as Record<string, unknown>,
      status: "PROCESSING",
      expiresAt,
    },
  });

  try {
    switch (topic) {
      case "APP_UNINSTALLED": {
        await handleAppUninstalled(shopRecord.id, shopRecord.shopDomain);
        break;
      }

      case "ORDERS_PAID":
      case "ORDERS_CREATE": {
        await handleOrderEvent(topic, shopRecord, payload as Record<string, unknown>);
        break;
      }

      case "REFUNDS_CREATE": {
        log.info("Refund webhook received – not yet handled");
        break;
      }

      default:
        log.warn({ topic }, "Unhandled webhook topic");
    }

    await db.webhookEvent.update({
      where: { id: event.id },
      data: { status: "DONE", processedAt: new Date() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "Webhook processing failed");

    await db.webhookEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", lastError: msg },
    });

    return new Response("Processing error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
};

async function handleAppUninstalled(shopId: string, shopDomain: string) {
  logger.info({ shopDomain }, "App uninstalled – marking shop inactive");

  await db.shop.update({
    where: { id: shopId },
    data: { isActive: false, uninstalledAt: new Date() },
  });

  // GDPR: delete transient data (keep invoices per retention policy)
  // Sessions are cleaned up by Shopify session storage automatically
  await db.webhookEvent.deleteMany({
    where: { shopId, createdAt: { lt: new Date(Date.now() - 1000) } },
  });

  logger.info({ shopDomain }, "Shop deactivated after uninstall");
}

// Extract EHF checkout attributes from order note_attributes
function extractEhfAttributes(payload: Record<string, unknown>) {
  const noteAttributes = (payload.note_attributes ?? []) as Array<{
    name: string;
    value: string;
  }>;
  const attrs: Record<string, string> = {};
  for (const attr of noteAttributes) {
    if (attr.name.startsWith("_ehf_")) {
      attrs[attr.name] = attr.value;
    }
  }
  return {
    requested: attrs._ehf_invoice_requested === "true",
    orgNr: attrs._ehf_org_nr ?? "",
    companyName: attrs._ehf_company_name ?? "",
    reference: attrs._ehf_reference ?? "",
  };
}

async function handleOrderEvent(
  topic: string,
  shop: { id: string; invoiceMode: string; shopDomain: string },
  payload: Record<string, unknown>
) {
  const orderId = `gid://shopify/Order/${payload.id}`;
  const orderName = payload.name as string;
  const financialStatus = payload.financial_status as string;
  const log = logger.child({ shopId: shop.id, orderId, orderName });

  // Extract EHF attributes from checkout extension
  const ehf = extractEhfAttributes(payload);

  if (topic === "ORDERS_PAID" || (topic === "ORDERS_CREATE" && financialStatus === "paid")) {
    // Check if invoice already exists
    const existing = await db.invoice.findFirst({
      where: { shopId: shop.id, shopifyOrderId: orderId },
    });

    if (existing) {
      log.info("Invoice already exists for order – skipping");
      return;
    }

    const customerId = payload.customer
      ? `gid://shopify/Customer/${(payload.customer as { id: number }).id}`
      : null;

    if (!customerId) {
      log.info("No customer on order – skipping auto invoice");
      return;
    }

    // Auto-create B2B customer from checkout attributes if EHF was requested
    if (ehf.requested && ehf.orgNr) {
      const existingB2B = await db.b2bCustomer.findFirst({
        where: { shopId: shop.id, shopifyCustomerId: customerId },
      });

      if (!existingB2B) {
        log.info({ orgNr: ehf.orgNr, companyName: ehf.companyName }, "Auto-creating B2B customer from checkout");
        await db.b2bCustomer.create({
          data: {
            shopId: shop.id,
            shopifyCustomerId: customerId,
            companyName: ehf.companyName,
            orgNr: ehf.orgNr,
            invoiceEmail: (payload.customer as { email?: string })?.email ?? "",
            reference: ehf.reference,
            sendEhf: true,
            sendEmail: true,
          },
        });
      } else if (ehf.reference && ehf.reference !== existingB2B.reference) {
        // Update reference if changed
        await db.b2bCustomer.update({
          where: { id: existingB2B.id },
          data: { reference: ehf.reference },
        });
      }
    }

    // Now check for B2B customer (either existing or just created)
    const b2bCustomer = await db.b2bCustomer.findFirst({
      where: { shopId: shop.id, shopifyCustomerId: customerId },
    });

    if (!b2bCustomer) {
      if (shop.invoiceMode === "AUTO_ON_PAID") {
        log.info({ customerId }, "No B2B profile and no EHF requested – skipping");
      }
      return;
    }

    // Enqueue invoice creation job
    await invoiceQueue().add("create-invoice", {
      shopId: shop.id,
      shopifyOrderId: orderId,
      shopifyOrderName: orderName,
      b2bCustomerId: b2bCustomer.id,
      triggeredBy: ehf.requested ? "checkout_extension" : "webhook",
    });

    log.info({ triggeredBy: ehf.requested ? "checkout" : "webhook" }, "Invoice creation job enqueued");
  }
}
