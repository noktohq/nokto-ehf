// app/routes/app.invoices.$id.xml.tsx
import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import * as fs from "fs/promises";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return new Response("Not found", { status: 404 });

  const invoice = await db.invoice.findFirst({
    where: { id: params.id, shopId: shop.id },
    select: { ehfXmlPath: true, invoiceNumber: true },
  });

  if (!invoice?.ehfXmlPath) return new Response("EHF XML not found", { status: 404 });

  const xml = await fs.readFile(invoice.ehfXmlPath, "utf8");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="ehf-${invoice.invoiceNumber}.xml"`,
    },
  });
}
