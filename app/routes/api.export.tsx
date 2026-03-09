// app/routes/api.export.tsx
// GDPR data export – shop owner can download all their data
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ error: "Not found" }, { status: 404 });

  const [customers, invoices, auditLogs] = await Promise.all([
    db.b2BCustomer.findMany({
      where: { shopId: shop.id },
      select: {
        companyName: true,
        orgNr: true,
        invoiceEmail: true,
        peppolParticipantId: true,
        reference: true,
        paymentTermsDays: true,
        kidFormat: true,
        createdAt: true,
      },
    }),
    db.invoice.findMany({
      where: { shopId: shop.id },
      select: {
        invoiceNumber: true,
        shopifyOrderName: true,
        issueDate: true,
        dueDate: true,
        status: true,
        totalOre: true,
        currency: true,
        emailSentAt: true,
        ehfSentAt: true,
        createdAt: true,
      },
    }),
    db.auditLog.findMany({
      where: { shopId: shop.id },
      select: {
        action: true,
        entityType: true,
        entityId: true,
        actorType: true,
        createdAt: true,
      },
    }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    shop: {
      shopDomain: shop.shopDomain,
      senderCompany: shop.senderCompany,
      senderOrgNr: shop.senderOrgNr,
      senderEmail: shop.senderEmail,
      installedAt: shop.installedAt,
    },
    customers,
    invoices: invoices.map((i) => ({
      ...i,
      totalNok: (i.totalOre / 100).toFixed(2),
    })),
    auditLogs,
  };

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="nokto-export-${shop.shopDomain}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
