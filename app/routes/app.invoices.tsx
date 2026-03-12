// app/routes/app.invoices.tsx
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Button,
  Filters,
  Text,
  Link,
  EmptyState,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { oreToNok } from "~/lib/validators";
import { sendInvoice } from "~/lib/invoice.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ invoices: [], shopId: null });

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "";
  const search = url.searchParams.get("q") ?? "";

  const invoices = await db.invoice.findMany({
    where: {
      shopId: shop.id,
      ...(statusFilter ? { status: statusFilter as "DRAFT" | "READY" | "SENT" | "FAILED" } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search, mode: "insensitive" } },
              { shopifyOrderName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { b2bCustomer: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return json({
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      orderName: inv.shopifyOrderName,
      customer: inv.b2bCustomer?.companyName ?? "Ukjent",
      status: inv.status,
      totalNok: oreToNok(inv.totalOre),
      issueDate: inv.issueDate.toISOString().slice(0, 10),
      dueDate: inv.dueDate.toISOString().slice(0, 10),
    })),
    shopId: shop.id,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const invoiceId = formData.get("invoiceId") as string;

  if (intent === "send") {
    await sendInvoice(invoiceId, admin.graphql);
  }

  return json({ ok: true });
}

const STATUS_BADGES: Record<string, Parameters<typeof Badge>[0]["tone"]> = {
  DRAFT: "info",
  READY: "attention",
  SENDING: "warning",
  SENT: "success",
  FAILED: "critical",
  CANCELLED: undefined,
};

export default function InvoicesPage() {
  const { invoices } = useLoaderData<typeof loader>();
  const nav = useNavigation();

  if (invoices.length === 0) {
    return (
      <Page title="Fakturaer">
        <EmptyState
          heading="Ingen fakturaer ennå"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>Fakturaer opprettes automatisk eller manuelt fra Ordrer-siden.</p>
        </EmptyState>
      </Page>
    );
  }

  const rows = invoices.map((inv) => [
    <Link key={`link-${inv.id}`} url={`/app/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>,
    inv.orderName,
    inv.customer,
    <Badge key={`badge-${inv.id}`} tone={STATUS_BADGES[inv.status]}>{inv.status}</Badge>,
    `kr ${inv.totalNok}`,
    inv.issueDate,
    inv.dueDate,
    <Form key={`form-${inv.id}`} method="post">
      <input type="hidden" name="intent" value="send" />
      <input type="hidden" name="invoiceId" value={inv.id} />
      <Button
        size="slim"
        submit
        disabled={nav.state === "submitting" || inv.status === "SENT"}
      >
        Send
      </Button>
    </Form>,
  ]);

  return (
    <Page title="Fakturaer" primaryAction={{ content: "Ny faktura", url: "/app/orders" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">{invoices.length} fakturaer</Text>
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "numeric", "text", "text", "text"]}
                headings={["Fakturanr", "Ordre", "Kunde", "Status", "Beløp", "Fakturadato", "Forfall", ""]}
                rows={rows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
