// app/routes/app.billing.tsx
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  Badge,
  DataTable,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { buildSubscriptionMutation } from "~/lib/billing/shopify-billing.server";
import { getCurrentMonthKey, oreToNok } from "~/lib/validators";

const MONTHLY_PRICE = parseInt(process.env.MONTHLY_PRICE_NOK ?? "1490", 10);
const USAGE_PRICE = parseInt(process.env.USAGE_PRICE_PER_EHF_NOK ?? "6", 10);
const INCLUDED_EHF = parseInt(process.env.INCLUDED_EHF_PER_MONTH ?? "50", 10);

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Not found", { status: 404 });

  const overage = Math.max(0, shop.ehfSentThisMonth - INCLUDED_EHF);
  const estimatedOverage = overage * USAGE_PRICE;

  return json({
    shop: {
      subscriptionStatus: shop.subscriptionStatus ?? "none",
      billingPlanActive: shop.billingPlanActive,
      trialEndsAt: shop.trialEndsAt?.toISOString() ?? null,
      ehfSentThisMonth: shop.ehfSentThisMonth,
      billingMonthYear: shop.billingMonthYear,
    },
    pricing: {
      monthly: MONTHLY_PRICE,
      perEhf: USAGE_PRICE,
      included: INCLUDED_EHF,
    },
    usage: {
      ehfSent: shop.ehfSentThisMonth,
      included: INCLUDED_EHF,
      overage,
      estimatedOverage,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);

  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing/confirmed?shop=${session.shop}`;
  const mutation = buildSubscriptionMutation(session.shop, returnUrl);

  const res = await admin.graphql(mutation);
  const data = (await res.json()) as {
    data: { appSubscriptionCreate: { confirmationUrl?: string; userErrors: Array<{ message: string }> } };
  };

  const result = data.data?.appSubscriptionCreate;
  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join(", "));
  }

  if (result?.confirmationUrl) {
    return redirect(result.confirmationUrl);
  }

  return json({ ok: true });
}

export default function BillingPage() {
  const { shop, pricing, usage } = useLoaderData<typeof loader>();

  const statusBadge =
    shop.subscriptionStatus === "active"
      ? "success"
      : shop.subscriptionStatus === "pending"
      ? "attention"
      : "critical";

  return (
    <Page title="Abonnement">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Abonnementsstatus</Text>

              <Badge tone={statusBadge}>
                {shop.subscriptionStatus === "active"
                  ? "Aktiv"
                  : shop.subscriptionStatus === "pending"
                  ? "Venter"
                  : "Ikke aktiv"}
              </Badge>

              {shop.trialEndsAt && new Date(shop.trialEndsAt) > new Date() && (
                <Banner tone="info">
                  Prøveperiode utløper: {new Date(shop.trialEndsAt).toLocaleDateString("nb-NO")}
                </Banner>
              )}

              {!shop.billingPlanActive && (
                <Form method="post">
                  <Button submit variant="primary">Aktiver abonnement</Button>
                </Form>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Prisplan</Text>
              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["Element", "Pris"]}
                rows={[
                  ["Månedlig abonnement", `kr ${pricing.monthly},-`],
                  ["Inkluderte EHF per måned", String(pricing.included)],
                  ["Overforbruk per EHF", `kr ${pricing.perEhf},-`],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Forbruk – {shop.billingMonthYear}</Text>
              <DataTable
                columnContentTypes={["text", "numeric"]}
                headings={["", ""]}
                rows={[
                  ["EHF sendt denne måneden", usage.ehfSent],
                  ["Inkludert", usage.included],
                  ["Overforbruk", usage.overage],
                  ["Estimert overforbrukskostnad", `kr ${usage.estimatedOverage},-`],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
