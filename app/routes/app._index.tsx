// app/routes/app._index.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  DataTable,
  Badge,
  Banner,
  BlockStack,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { getCurrentMonthKey } from "~/lib/validators";

const INCLUDED_EHF = parseInt(process.env.INCLUDED_EHF_PER_MONTH ?? "50", 10);

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });

  if (!shop) return json({ stats: null, shop: null });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last7 = new Date(today.getTime() - 6 * 86400000);
  const last30 = new Date(today.getTime() - 29 * 86400000);

  const [todayCount, week7Count, month30Count, ehfToday, ehf7, ehf30, failedJobs] = await Promise.all([
    db.invoice.count({ where: { shopId: shop.id, createdAt: { gte: today } } }),
    db.invoice.count({ where: { shopId: shop.id, createdAt: { gte: last7 } } }),
    db.invoice.count({ where: { shopId: shop.id, createdAt: { gte: last30 } } }),
    db.invoice.count({ where: { shopId: shop.id, ehfSentAt: { gte: today } } }),
    db.invoice.count({ where: { shopId: shop.id, ehfSentAt: { gte: last7 } } }),
    db.invoice.count({ where: { shopId: shop.id, ehfSentAt: { gte: last30 } } }),
    db.invoice.count({ where: { shopId: shop.id, status: "FAILED" } }),
  ]);

  const ehfUsed = shop.ehfSentThisMonth;
  const ehfRemaining = Math.max(0, INCLUDED_EHF - ehfUsed);
  const overage = Math.max(0, ehfUsed - INCLUDED_EHF);

  return json({
    stats: {
      invoices: { today: todayCount, week: week7Count, month: month30Count },
      ehf: { today: ehfToday, week: ehf7, month: ehf30 },
      failedJobs,
      ehfUsed,
      ehfRemaining,
      overage,
      included: INCLUDED_EHF,
      monthKey: shop.billingMonthYear,
    },
    shop: {
      invoiceMode: shop.invoiceMode,
      billingPlanActive: shop.billingPlanActive,
      trialEndsAt: shop.trialEndsAt?.toISOString() ?? null,
    },
  });
}

export default function Dashboard() {
  const { stats, shop } = useLoaderData<typeof loader>();

  if (!stats || !shop) {
    return (
      <Page title="Dashboard">
        <Banner tone="critical">Butikk ikke funnet. Prøv å installere appen på nytt.</Banner>
      </Page>
    );
  }

  const trialDaysLeft = shop.trialEndsAt
    ? Math.ceil((new Date(shop.trialEndsAt).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <Page title="Nokto EHF Invoicing – Dashboard">
      <Layout>
        {!shop.billingPlanActive && trialDaysLeft !== null && trialDaysLeft > 0 && (
          <Layout.Section>
            <Banner
              tone="warning"
              title={`Prøveperiode: ${trialDaysLeft} dager igjen`}
              action={{ content: "Aktiver abonnement", url: "/app/billing" }}
            >
              <p>Aktiver abonnement for å fortsette etter prøveperioden.</p>
            </Banner>
          </Layout.Section>
        )}

        {stats.failedJobs > 0 && (
          <Layout.Section>
            <Banner tone="critical" title={`${stats.failedJobs} faktura(er) feilet`} action={{ content: "Se logger", url: "/app/logs" }}>
              <p>Noen fakturaer klarte ikke å bli sendt. Sjekk logger for detaljer.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            <InlineStack gap="400" wrap>
              <StatCard title="Fakturaer i dag" value={stats.invoices.today} />
              <StatCard title="Fakturaer siste 7 dager" value={stats.invoices.week} />
              <StatCard title="Fakturaer siste 30 dager" value={stats.invoices.month} />
            </InlineStack>

            <InlineStack gap="400" wrap>
              <StatCard title="EHF sendt i dag" value={stats.ehf.today} />
              <StatCard title="EHF sendt siste 7 dager" value={stats.ehf.week} />
              <StatCard title="EHF sendt siste 30 dager" value={stats.ehf.month} />
            </InlineStack>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">EHF-forbruk denne måneden ({stats.monthKey})</Text>

              <DataTable
                columnContentTypes={["text", "numeric"]}
                headings={["", ""]}
                rows={[
                  ["Inkludert per måned", String(stats.included)],
                  ["Brukt denne måneden", String(stats.ehfUsed)],
                  ["Gjenstående inkludert", String(stats.ehfRemaining)],
                  ["Overforbruk (6 kr/stk)", String(stats.overage)],
                  ["Estimert overforbrukskostnad", `kr ${(stats.overage * 6).toFixed(2)}`],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Fakturamodus</Text>
              <InlineStack gap="200">
                <Badge tone={shop.invoiceMode === "AUTO_ON_PAID" ? "success" : "info"}>
                  {shop.invoiceMode === "AUTO_ON_PAID" ? "Automatisk ved betaling" : "Manuell"}
                </Badge>
                <Text as="p" tone="subdued">Endre i Innstillinger</Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Box minWidth="150px">
      <Card>
        <BlockStack gap="100">
          <Text as="p" tone="subdued" variant="bodySm">{title}</Text>
          <Text as="p" variant="headingXl" fontWeight="bold">{value}</Text>
        </BlockStack>
      </Card>
    </Box>
  );
}
