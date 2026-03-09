// app/routes/app.invoices.$id.pdf.tsx
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
    select: { pdfPath: true, invoiceNumber: true },
  });

  if (!invoice?.pdfPath) return new Response("PDF not found", { status: 404 });

  const pdf = await fs.readFile(invoice.pdfPath);

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="faktura-${invoice.invoiceNumber}.pdf"`,
      "Content-Length": String(pdf.length),
    },
  });
}
