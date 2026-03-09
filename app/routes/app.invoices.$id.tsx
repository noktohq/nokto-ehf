// app/routes/app.invoices.$id.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Divider,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { oreToNok } from "~/lib/validators";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const invoice = await db.invoice.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: { lines: { orderBy: { lineNum: "asc" } }, b2bCustomer: true },
  });

  if (!invoice) throw new Response("Invoice not found", { status: 404 });

  return json({
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      orderName: invoice.shopifyOrderName,
      issueDate: invoice.issueDate.toISOString().slice(0, 10),
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      currency: invoice.currency,
      subtotalNok: oreToNok(invoice.subtotalOre),
      vatNok: oreToNok(invoice.vatOre),
      totalNok: oreToNok(invoice.totalOre),
      kidNumber: invoice.kidNumber,
      emailSentAt: invoice.emailSentAt?.toISOString() ?? null,
      ehfSentAt: invoice.ehfSentAt?.toISOString() ?? null,
      emailError: invoice.emailError,
      ehfError: invoice.ehfError,
      ehfProviderRef: invoice.ehfProviderRef,
      hasPdf: !!invoice.pdfPath,
      hasXml: !!invoice.ehfXmlPath,
    },
    customer: invoice.b2bCustomer
      ? {
          companyName: invoice.b2bCustomer.companyName,
          orgNr: invoice.b2bCustomer.orgNr,
          peppolId: invoice.b2bCustomer.peppolParticipantId,
        }
      : null,
    lines: invoice.lines.map((l) => ({
      lineNum: l.lineNum,
      description: l.description,
      quantity: l.quantity,
      unitPriceNok: oreToNok(l.unitPriceOre),
      vatPct: Math.round(l.vatRate * 100),
      lineNetNok: oreToNok(l.lineNetOre),
      lineTotalNok: oreToNok(l.lineTotalOre),
    })),
  });
}

export default function InvoiceDetail() {
  const { invoice, customer, lines } = useLoaderData<typeof loader>();

  return (
    <Page
      title={`Faktura ${invoice.invoiceNumber}`}
      backAction={{ content: "Fakturaer", url: "/app/invoices" }}
      secondaryActions={[
        ...(invoice.hasPdf
          ? [{ content: "Last ned PDF", url: `/app/invoices/${invoice.id}/pdf`, external: true }]
          : []),
        ...(invoice.hasXml
          ? [{ content: "Last ned EHF XML", url: `/app/invoices/${invoice.id}/xml`, external: true }]
          : []),
      ]}
    >
      <Layout>
        {invoice.emailError && (
          <Layout.Section>
            <Banner tone="critical" title="E-post feilet">
              <p>{invoice.emailError}</p>
            </Banner>
          </Layout.Section>
        )}
        {invoice.ehfError && (
          <Layout.Section>
            <Banner tone="critical" title="EHF sending feilet">
              <p>{invoice.ehfError}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">Fakturainfo</Text>
                <Badge
                  tone={
                    invoice.status === "SENT"
                      ? "success"
                      : invoice.status === "FAILED"
                      ? "critical"
                      : invoice.status === "READY"
                      ? "attention"
                      : "info"
                  }
                >
                  {invoice.status}
                </Badge>
              </InlineStack>

              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["", ""]}
                rows={[
                  ["Fakturanummer", invoice.invoiceNumber],
                  ["Ordrereferanse", invoice.orderName],
                  ["Fakturadato", invoice.issueDate],
                  ["Forfallsdato", invoice.dueDate],
                  ...(invoice.kidNumber ? [["KID", invoice.kidNumber]] : []),
                  ...(invoice.emailSentAt ? [["E-post sendt", invoice.emailSentAt]] : []),
                  ...(invoice.ehfSentAt ? [["EHF sendt", invoice.ehfSentAt]] : []),
                  ...(invoice.ehfProviderRef ? [["EHF ref", invoice.ehfProviderRef]] : []),
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {customer && (
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Kjøper</Text>
                <Text as="p">{customer.companyName}</Text>
                <Text as="p" tone="subdued">Org.nr: {customer.orgNr}</Text>
                {customer.peppolId && <Text as="p" tone="subdued">Peppol: {customer.peppolId}</Text>}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Linjer</Text>
              <DataTable
                columnContentTypes={["numeric", "text", "numeric", "numeric", "numeric", "numeric"]}
                headings={["#", "Beskrivelse", "Ant.", "Enhetspris", "MVA%", "Netto"]}
                rows={lines.map((l) => [
                  l.lineNum,
                  l.description,
                  l.quantity,
                  `kr ${l.unitPriceNok}`,
                  `${l.vatPct}%`,
                  `kr ${l.lineNetNok}`,
                ])}
                totals={["", "", "", "", "", `kr ${invoice.subtotalNok}`]}
              />

              <Divider />

              <InlineStack align="end" gap="400">
                <BlockStack gap="100" inlineAlign="end">
                  <Text as="p">Netto: kr {invoice.subtotalNok}</Text>
                  <Text as="p">MVA: kr {invoice.vatNok}</Text>
                  <Text as="p" variant="headingMd" fontWeight="bold">
                    Å betale: kr {invoice.totalNok}
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
