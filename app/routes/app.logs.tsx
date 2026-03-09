// app/routes/app.logs.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Tabs,
  Text,
  BlockStack,
  Badge,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ auditLogs: [], webhookLogs: [] });

  const [auditLogs, webhookLogs] = await Promise.all([
    db.auditLog.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.webhookEvent.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return json({
    auditLogs: auditLogs.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      actorType: l.actorType,
      createdAt: l.createdAt.toISOString(),
    })),
    webhookLogs: webhookLogs.map((w) => ({
      id: w.id,
      topic: w.topic,
      status: w.status,
      attempts: w.attempts,
      lastError: w.lastError,
      createdAt: w.createdAt.toISOString(),
      processedAt: w.processedAt?.toISOString() ?? null,
    })),
  });
}

const STATUS_BADGE: Record<string, Parameters<typeof Badge>[0]["tone"]> = {
  DONE: "success",
  PENDING: "attention",
  PROCESSING: "warning",
  FAILED: "critical",
  SKIPPED: "info",
};

export default function LogsPage() {
  const { auditLogs, webhookLogs } = useLoaderData<typeof loader>();
  const [selected, setSelected] = useState(0);

  const tabs = [
    { id: "audit", content: `Audit-logger (${auditLogs.length})` },
    { id: "webhooks", content: `Webhook-logger (${webhookLogs.length})` },
  ];

  const auditRows = auditLogs.map((l) => [
    l.action,
    l.entityType,
    l.entityId ?? "—",
    l.actorType,
    new Date(l.createdAt).toLocaleString("nb-NO"),
  ]);

  const webhookRows = webhookLogs.map((w) => [
    w.topic,
    <Badge tone={STATUS_BADGE[w.status]}>{w.status}</Badge>,
    w.attempts,
    w.lastError ?? "—",
    new Date(w.createdAt).toLocaleString("nb-NO"),
  ]);

  return (
    <Page title="Logger">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Tabs tabs={tabs} selected={selected} onSelect={setSelected} />

              {selected === 0 && (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Handling", "Entitet", "ID", "Aktør", "Tidspunkt"]}
                  rows={auditRows}
                />
              )}

              {selected === 1 && (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "text", "text"]}
                  headings={["Emne", "Status", "Forsøk", "Feil", "Tidspunkt"]}
                  rows={webhookRows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
