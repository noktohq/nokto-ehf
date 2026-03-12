// app/routes/app.orders.tsx
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  Badge,
  Text,
  Banner,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { buildInvoiceFromOrder } from "~/lib/invoice.server";

const ORDER_QUERY = `
  query GetRecentOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true,
           query: "financial_status:paid") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        financialStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        customer { id displayName }
        lineItems(first: 20) {
          nodes { id title variantTitle quantity originalUnitPriceSet { shopMoney { amount } } }
        }
        shippingLines(first: 3) {
          nodes { title originalPriceSet { shopMoney { amount } } }
        }
      }
    }
  }
`;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });

  const res = await admin.graphql(ORDER_QUERY, { variables: { first: 50 } });
  const data = (await res.json()) as { data: { orders: { nodes: ShopifyOrder[] } } };
  const orders = data.data?.orders?.nodes ?? [];

  // Get existing invoice order IDs
  const existingInvoices = shop
    ? await db.invoice.findMany({
        where: {
          shopId: shop.id,
          shopifyOrderId: { in: orders.map((o) => o.id) },
        },
        select: { shopifyOrderId: true, invoiceNumber: true, status: true },
      })
    : [];

  const invoiceMap = Object.fromEntries(existingInvoices.map((i) => [i.shopifyOrderId, i]));

  return json({
    orders: orders.map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt.slice(0, 10),
      financialStatus: o.financialStatus,
      total: `${o.totalPriceSet.shopMoney.currencyCode} ${parseFloat(o.totalPriceSet.shopMoney.amount).toFixed(2)}`,
      customer: o.customer?.displayName ?? "Anonym",
      customerId: o.customer?.id ?? null,
      existingInvoice: invoiceMap[o.id] ?? null,
      raw: o,
    })),
    shopId: shop?.id,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ error: "Shop not found" });

  const formData = await request.formData();
  const orderId = formData.get("orderId") as string;
  const orderName = formData.get("orderName") as string;
  const rawOrder = JSON.parse(formData.get("rawOrder") as string) as ShopifyOrder;
  const customerId = formData.get("customerId") as string | null;

  if (!customerId) {
    return json({ error: "Ordre mangler kunde. Kan ikke opprette faktura." });
  }

  const b2bCustomer = await db.b2BCustomer.findFirst({
    where: { shopId: shop.id, shopifyCustomerId: customerId },
  });

  if (!b2bCustomer) {
    return json({
      error: `Ingen B2B-profil funnet for kunde ${customerId}. Opprett B2B-profil under Kunder.`,
    });
  }

  // Build order data for invoice
  const orderData = {
    id: rawOrder.id,
    name: rawOrder.name,
    financialStatus: rawOrder.financialStatus,
    lineItems: rawOrder.lineItems.nodes.map((li) => ({
      id: li.id,
      title: li.title,
      variantTitle: li.variantTitle,
      quantity: li.quantity,
      price: li.originalUnitPriceSet.shopMoney.amount,
    })),
    shippingLines: rawOrder.shippingLines.nodes.map((sl) => ({
      title: sl.title,
      price: sl.originalPriceSet.shopMoney.amount,
    })),
  };

  try {
    const invoiceId = await buildInvoiceFromOrder({
      shopId: shop.id,
      shop,
      b2bCustomer,
      shopifyOrderId: orderId,
      shopifyOrderName: orderName,
      orderData,
    });

    return json({ ok: true, invoiceId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export default function OrdersPage() {
  const { orders } = useLoaderData<typeof loader>();
  const nav = useNavigation();

  const rows = orders.map((o) => [
    o.name,
    o.customer,
    o.createdAt,
    <Badge key={`status-${o.id}`} tone={o.financialStatus === "PAID" ? "success" : "info"}>
      {o.financialStatus}
    </Badge>,
    o.total,
    o.existingInvoice ? (
      <Badge key={`inv-${o.id}`} tone={o.existingInvoice.status === "SENT" ? "success" : "attention"}>
        {o.existingInvoice.invoiceNumber}
      </Badge>
    ) : (
      <Form key={`form-${o.id}`} method="post">
        <input type="hidden" name="orderId" value={o.id} />
        <input type="hidden" name="orderName" value={o.name} />
        <input type="hidden" name="customerId" value={o.customerId ?? ""} />
        <input type="hidden" name="rawOrder" value={JSON.stringify(o.raw)} />
        <Button
          size="slim"
          submit
          disabled={nav.state === "submitting" || !o.customerId}
        >
          Opprett faktura
        </Button>
      </Form>
    ),
  ]);

  return (
    <Page title="Ordrer (betalte)">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Siste 50 betalte ordrer</Text>
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "numeric", "text"]}
                headings={["Ordre", "Kunde", "Dato", "Status", "Total", "Faktura"]}
                rows={rows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// Types
interface ShopifyOrder {
  id: string;
  name: string;
  createdAt: string;
  financialStatus: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customer?: { id: string; displayName: string };
  lineItems: {
    nodes: Array<{
      id: string;
      title: string;
      variantTitle?: string;
      quantity: number;
      originalUnitPriceSet: { shopMoney: { amount: string } };
    }>;
  };
  shippingLines: {
    nodes: Array<{ title: string; originalPriceSet: { shopMoney: { amount: string } } }>;
  };
}
