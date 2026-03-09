// app/lib/billing/shopify-billing.server.ts
import { db } from "~/db.server";
import { getCurrentMonthKey } from "~/lib/validators";
import { logger } from "~/lib/logger.server";
import { audit } from "~/lib/audit.server";

const MONTHLY_PRICE_NOK = parseFloat(process.env.MONTHLY_PRICE_NOK ?? "1490");
const USAGE_PRICE_PER_EHF = parseFloat(process.env.USAGE_PRICE_PER_EHF_NOK ?? "6");
const INCLUDED_EHF = parseInt(process.env.INCLUDED_EHF_PER_MONTH ?? "50", 10);
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS ?? "7", 10);

/** Build the AppSubscription create mutation */
export function buildSubscriptionMutation(shopDomain: string, returnUrl: string): string {
  return `
    mutation {
      appSubscriptionCreate(
        name: "Nokto EHF Invoicing - Månedlig"
        returnUrl: "${returnUrl}"
        trialDays: ${TRIAL_DAYS}
        test: ${process.env.NODE_ENV !== "production"}
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: ${MONTHLY_PRICE_NOK}, currencyCode: NOK }
                interval: EVERY_30_DAYS
              }
            }
          }
        ]
      ) {
        userErrors { field message }
        confirmationUrl
        appSubscription { id status }
      }
    }
  `;
}

/** Build usage charge mutation */
export function buildUsageChargeMutation(subscriptionLineItemId: string, quantity: number): string {
  const amount = (quantity * USAGE_PRICE_PER_EHF).toFixed(2);
  return `
    mutation {
      appUsageRecordCreate(
        subscriptionLineItemId: "${subscriptionLineItemId}"
        price: { amount: ${amount}, currencyCode: NOK }
        description: "${quantity} EHF-faktura sendt"
        idempotencyKey: "${subscriptionLineItemId}-${Date.now()}"
      ) {
        userErrors { field message }
        appUsageRecord { id }
      }
    }
  `;
}

/**
 * Increment EHF usage for the shop.
 * Resets counter automatically on new month.
 * Creates usage charge via Shopify Billing API when over the included limit.
 */
export async function incrementEHFUsage(shopId: string, adminGraphQL: (q: string) => Promise<Response>): Promise<void> {
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) return;

  const currentMonth = getCurrentMonthKey();

  // Reset counter on new month
  if (shop.billingMonthYear !== currentMonth) {
    await db.shop.update({
      where: { id: shopId },
      data: { ehfSentThisMonth: 1, billingMonthYear: currentMonth },
    });
    logger.info({ shopId, month: currentMonth }, "Billing month reset");
    return;
  }

  const newCount = shop.ehfSentThisMonth + 1;
  await db.shop.update({
    where: { id: shopId },
    data: { ehfSentThisMonth: newCount },
  });

  // Only charge when over the included limit
  if (newCount > INCLUDED_EHF) {
    logger.info({ shopId, newCount, included: INCLUDED_EHF }, "EHF over included limit – creating usage charge");
    try {
      // Get current subscription line item ID
      const subQuery = `{
        appInstallation {
          activeSubscriptions {
            id
            lineItems { id plan { pricingDetails { __typename } } }
          }
        }
      }`;
      const subRes = await adminGraphQL(subQuery);
      const subData = (await subRes.json()) as {
        data?: { appInstallation?: { activeSubscriptions?: Array<{ id: string; lineItems: Array<{ id: string }> }> } };
      };

      const subs = subData.data?.appInstallation?.activeSubscriptions ?? [];
      const lineItemId = subs[0]?.lineItems?.[0]?.id;
      if (!lineItemId) {
        logger.warn({ shopId }, "No subscription line item found – cannot create usage charge");
        return;
      }

      const mutation = buildUsageChargeMutation(lineItemId, 1);
      await adminGraphQL(mutation);

      await audit({ shopId, action: "billing.usage_charge", entityType: "shop", entityId: shopId, details: { count: newCount } });
    } catch (err) {
      logger.error({ shopId, err }, "Failed to create usage charge");
    }
  }
}

/**
 * Check if billing is active for a shop.
 */
export async function isBillingActive(shopId: string): Promise<boolean> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { billingPlanActive: true, subscriptionStatus: true, trialEndsAt: true },
  });
  if (!shop) return false;

  if (shop.billingPlanActive) return true;

  // Allow during trial
  if (shop.trialEndsAt && new Date() < shop.trialEndsAt) return true;

  return ["active", "pending"].includes(shop.subscriptionStatus ?? "");
}
