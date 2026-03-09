// app/routes/app.billing.confirmed.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Banner, BlockStack, Button, Text } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  // Give Shopify a moment to process the subscription
  const shop = await db.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { subscriptionStatus: true, billingPlanActive: true, trialEndsAt: true },
  });

  return json({
    subscriptionStatus: shop?.subscriptionStatus ?? "pending",
    billingPlanActive: shop?.billingPlanActive ?? false,
  });
}

export default function BillingConfirmed() {
  const { subscriptionStatus, billingPlanActive } = useLoaderData<typeof loader>();

  return (
    <Page title="Abonnement aktivert">
      <BlockStack gap="500">
        <Banner tone="success" title="Takk for at du valgte Nokto EHF!">
          <BlockStack gap="200">
            <Text as="p">
              Abonnementet ditt er nå aktivt. Du kan begynne å bruke EHF-fakturering
              med en gang.
            </Text>
            <Text as="p">
              Inkludert: 50 EHF-fakturaer per måned. Overforbruk faktureres med kr 6,-
              per faktura.
            </Text>
          </BlockStack>
        </Banner>

        {subscriptionStatus === "pending" && (
          <Banner tone="info" title="Venter på bekreftelse">
            <Text as="p">
              Abonnementet behandles. Last inn siden på nytt om noen sekunder.
            </Text>
          </Banner>
        )}

        <Button url="/app" variant="primary">
          Gå til dashboard
        </Button>
      </BlockStack>
    </Page>
  );
}
