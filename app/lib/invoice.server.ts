// app/lib/invoice.server.ts
import { db } from "~/db.server";
import { generateKid, nokToOre, oreToNok, getCurrentMonthKey } from "~/lib/validators";
import { generateEHFXml, validateEHFInput } from "~/lib/ehf/generator";
import { generateInvoicePdf } from "~/lib/pdf/generator";
import { logger } from "~/lib/logger.server";
import { audit } from "~/lib/audit.server";
import { createPeppolProvider } from "~/lib/ehf/provider";
import { incrementEHFUsage } from "~/lib/billing/shopify-billing.server";
import type { EHFInvoiceInput } from "~/lib/ehf/types";
import type { Shop, B2BCustomer } from "@prisma/client";
import * as fs from "fs/promises";
import * as path from "path";
import nodemailer from "nodemailer";
import { decrypt } from "~/lib/crypto.server";

const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? "./storage/invoices";

/**
 * Get or create the next invoice number for a shop.
 */
export async function nextInvoiceNumber(shopId: string, shop: Shop): Promise<string> {
  const seq = await db.invoiceSequence.upsert({
    where: { shopId },
    update: { current: { increment: 1 } },
    create: { shopId, current: shop.invoiceStartNumber },
  });

  const year = new Date().getFullYear();
  const num = String(seq.current).padStart(4, "0");
  return `${shop.invoicePrefix}-${year}-${num}`;
}

/**
 * Build invoice from Shopify order data.
 */
export async function buildInvoiceFromOrder(params: {
  shopId: string;
  shop: Shop;
  b2bCustomer: B2BCustomer;
  shopifyOrderId: string;
  shopifyOrderName: string;
  orderData: ShopifyOrder;
}): Promise<string> {
  const { shopId, shop, b2bCustomer, shopifyOrderId, shopifyOrderName, orderData } = params;

  const invoiceNumber = await nextInvoiceNumber(shopId, shop);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + b2bCustomer.paymentTermsDays);

  // Build invoice lines from Shopify order
  const lines: {
    lineNum: number;
    description: string;
    quantity: number;
    unitPriceOre: number;
    vatRate: number;
    vatOre: number;
    lineNetOre: number;
    lineTotalOre: number;
    shopifyLineItemId?: string;
  }[] = [];

  let subtotalOre = 0;
  let vatOre = 0;

  for (let i = 0; i < orderData.lineItems.length; i++) {
    const item = orderData.lineItems[i];
    const qty = parseFloat(item.quantity.toString());
    const unitPrice = nokToOre(item.originalUnitPrice ?? item.price);
    const lineNet = Math.round(qty * unitPrice);
    const vatRate = 0.25; // Default Norwegian VAT. Could be extended per product.
    const lineVat = Math.round(lineNet * vatRate);

    subtotalOre += lineNet;
    vatOre += lineVat;

    lines.push({
      lineNum: i + 1,
      description: item.title + (item.variantTitle ? ` (${item.variantTitle})` : ""),
      quantity: qty,
      unitPriceOre: unitPrice,
      vatRate,
      vatOre: lineVat,
      lineNetOre: lineNet,
      lineTotalOre: lineNet + lineVat,
      shopifyLineItemId: item.id,
    });
  }

  // Shipping line
  if (orderData.shippingLines?.length) {
    for (const sl of orderData.shippingLines) {
      const price = nokToOre(sl.price);
      const vatRate = 0.25;
      const lineVat = Math.round(price * vatRate);
      subtotalOre += price;
      vatOre += lineVat;
      lines.push({
        lineNum: lines.length + 1,
        description: `Frakt: ${sl.title}`,
        quantity: 1,
        unitPriceOre: price,
        vatRate,
        vatOre: lineVat,
        lineNetOre: price,
        lineTotalOre: price + lineVat,
      });
    }
  }

  const totalOre = subtotalOre + vatOre;

  // KID
  const invoiceNumeric = parseInt(invoiceNumber.replace(/\D/g, "").slice(-6), 10);
  let kidNumber: string | null = null;
  if (b2bCustomer.kidFormat === "KID10") kidNumber = generateKid(invoiceNumeric, 10);
  if (b2bCustomer.kidFormat === "KID15") kidNumber = generateKid(invoiceNumeric, 15);

  const invoice = await db.invoice.create({
    data: {
      shopId,
      b2bCustomerId: b2bCustomer.id,
      shopifyOrderId,
      shopifyOrderName,
      invoiceNumber,
      issueDate: new Date(),
      dueDate,
      status: "DRAFT",
      currency: "NOK",
      kidNumber,
      subtotalOre,
      vatOre,
      totalOre,
      orderDataJson: orderData as unknown as Record<string, unknown>,
      buyerDataJson: {
        companyName: b2bCustomer.companyName,
        orgNr: b2bCustomer.orgNr,
        invoiceEmail: b2bCustomer.invoiceEmail,
        peppolParticipantId: b2bCustomer.peppolParticipantId,
      },
      lines: { create: lines },
    },
    include: { lines: true, b2bCustomer: true },
  });

  // Generate PDF
  const pdfBytes = await generateInvoicePdf(invoice as Parameters<typeof generateInvoicePdf>[0], shop);
  const pdfDir = path.join(ARTIFACT_DIR, shopId);
  await fs.mkdir(pdfDir, { recursive: true });
  const pdfPath = path.join(pdfDir, `${invoice.id}.pdf`);
  await fs.writeFile(pdfPath, pdfBytes);

  // Generate EHF XML
  const ehfInput = buildEHFInput(invoice as Parameters<typeof buildEHFInput>[0], shop, b2bCustomer);
  const xmlErrors = validateEHFInput(ehfInput);
  let ehfXmlPath: string | null = null;

  if (xmlErrors.length === 0) {
    const xml = generateEHFXml(ehfInput);
    const xmlPath = path.join(pdfDir, `${invoice.id}.xml`);
    await fs.writeFile(xmlPath, xml, "utf8");
    ehfXmlPath = xmlPath;
  } else {
    logger.warn({ invoiceId: invoice.id, xmlErrors }, "EHF validation errors – XML not generated");
  }

  await db.invoice.update({
    where: { id: invoice.id },
    data: {
      pdfPath,
      ehfXmlPath,
      status: ehfXmlPath ? "READY" : "DRAFT",
    },
  });

  await audit({
    shopId,
    action: "invoice.created",
    entityType: "invoice",
    entityId: invoice.id,
    details: { invoiceNumber, shopifyOrderName, totalOre },
  });

  logger.info({ shopId, invoiceId: invoice.id, invoiceNumber }, "Invoice created");
  return invoice.id;
}

/**
 * Send invoice (email + EHF) based on customer settings.
 */
export async function sendInvoice(
  invoiceId: string,
  adminGraphQL?: (q: string) => Promise<Response>
): Promise<void> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true, b2bCustomer: true, shop: true },
  });

  if (!invoice || !invoice.b2bCustomer) {
    throw new Error(`Invoice ${invoiceId} or customer not found`);
  }

  const { shop, b2bCustomer } = invoice;
  let emailOk = false;
  let ehfOk = false;

  // --- Email ---
  if (b2bCustomer.sendEmail && invoice.pdfPath) {
    try {
      const smtpPass = await decrypt(shop.smtpPass);
      const transporter = nodemailer.createTransport({
        host: shop.smtpHost || process.env.SMTP_HOST,
        port: shop.smtpPort || parseInt(process.env.SMTP_PORT ?? "587", 10),
        secure: shop.smtpSecure,
        auth: shop.smtpUser ? { user: shop.smtpUser, pass: smtpPass } : undefined,
      });

      const pdfContent = await fs.readFile(invoice.pdfPath);

      await transporter.sendMail({
        from: shop.smtpFrom || process.env.SMTP_FROM,
        to: b2bCustomer.invoiceEmail,
        subject: `Faktura ${invoice.invoiceNumber} fra ${shop.senderCompany}`,
        text: `Hei,\n\nSe vedlagt faktura ${invoice.invoiceNumber} pålydende kr ${oreToNok(invoice.totalOre)}.\n\nForfall: ${invoice.dueDate.toISOString().slice(0, 10)}\n\nVennlig hilsen\n${shop.senderCompany}`,
        attachments: [
          { filename: `faktura-${invoice.invoiceNumber}.pdf`, content: pdfContent },
        ],
      });

      await db.invoice.update({ where: { id: invoiceId }, data: { emailSentAt: new Date() } });
      emailOk = true;
      logger.info({ invoiceId }, "Invoice email sent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.invoice.update({ where: { id: invoiceId }, data: { emailError: msg } });
      logger.error({ invoiceId, err: msg }, "Invoice email failed");
    }
  }

  // --- EHF/Peppol ---
  if (b2bCustomer.sendEhf && invoice.ehfXmlPath) {
    if (!b2bCustomer.peppolParticipantId) {
      await db.invoice.update({
        where: { id: invoiceId },
        data: { ehfError: "Customer missing peppolParticipantId" },
      });
    } else {
      try {
        const providerOptions = shop.peppolProviderApiUrl
          ? {
              provider: process.env.PEPPOL_PROVIDER,
              apiUrl: shop.peppolProviderApiUrl,
              apiKey: shop.peppolProviderApiKey ? await decrypt(shop.peppolProviderApiKey) : undefined,
              senderId: shop.peppolProviderSenderId || undefined,
            }
          : undefined;

        const provider = createPeppolProvider(providerOptions);
        const xml = await fs.readFile(invoice.ehfXmlPath, "utf8");

        const result = await provider.sendDocument({
          idempotencyKey: invoice.id,
          senderParticipantId: shop.peppolParticipantId,
          receiverParticipantId: b2bCustomer.peppolParticipantId,
          documentXml: xml,
        });

        await db.invoice.update({
          where: { id: invoiceId },
          data: { ehfSentAt: new Date(), ehfProviderRef: result.providerDocumentId },
        });

        // Increment billing usage
        if (adminGraphQL) {
          await incrementEHFUsage(invoice.shopId, adminGraphQL);
        }

        ehfOk = true;
        logger.info({ invoiceId, providerRef: result.providerDocumentId }, "EHF sent");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.invoice.update({ where: { id: invoiceId }, data: { ehfError: msg } });
        logger.error({ invoiceId, err: msg }, "EHF send failed");
      }
    }
  }

  // Update overall status
  const allSentOk = (!b2bCustomer.sendEmail || emailOk) && (!b2bCustomer.sendEhf || ehfOk);
  const anyFailed = (b2bCustomer.sendEmail && !emailOk) || (b2bCustomer.sendEhf && !ehfOk);

  await db.invoice.update({
    where: { id: invoiceId },
    data: { status: allSentOk ? "SENT" : anyFailed ? "FAILED" : "READY" },
  });

  await audit({
    shopId: invoice.shopId,
    action: "invoice.sent",
    entityType: "invoice",
    entityId: invoiceId,
    details: { emailOk, ehfOk },
  });
}

// --- EHF input builder ---

function buildEHFInput(
  invoice: {
    invoiceNumber: string;
    issueDate: Date;
    dueDate: Date;
    currency: string;
    shopifyOrderName: string;
    kidNumber: string | null;
    lines: Array<{
      lineNum: number;
      description: string;
      quantity: number;
      unitPriceOre: number;
      vatRate: number;
      lineNetOre: number;
    }>;
    subtotalOre: number;
    vatOre: number;
    totalOre: number;
    shop: Shop;
  },
  shop: Shop,
  buyer: B2BCustomer
): EHFInvoiceInput {
  const ehfLines = invoice.lines.map((l) => ({
    id: l.lineNum,
    description: l.description,
    quantity: l.quantity,
    unitCode: "EA",
    unitPriceNok: oreToNok(l.unitPriceOre),
    lineNetNok: oreToNok(l.lineNetOre),
    vatRate: l.vatRate,
    vatCategoryCode: l.vatRate > 0 ? "S" : "Z",
  }));

  const taxTotals = [
    {
      taxAmount: oreToNok(invoice.vatOre),
      taxableAmount: oreToNok(invoice.subtotalOre),
      taxRate: 0.25,
      taxCategoryCode: "S",
    },
  ];

  return {
    customizationId: shop.ehfCustomizationId,
    profileId: shop.ehfProfileId,
    invoiceId: invoice.invoiceNumber,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    currencyCode: invoice.currency,
    orderReference: invoice.shopifyOrderName,
    supplier: {
      name: shop.senderCompany,
      orgNr: shop.senderOrgNr,
      vatNr: shop.senderVatNr,
      streetName: shop.senderAddress,
      city: shop.senderCity,
      postalZone: shop.senderZip,
      country: shop.senderCountry,
      peppolId: shop.peppolParticipantId || undefined,
      email: shop.senderEmail,
    },
    customer: {
      name: buyer.companyName,
      orgNr: buyer.orgNr,
      country: "NO",
      peppolId: buyer.peppolParticipantId || undefined,
      email: buyer.invoiceEmail,
    },
    lines: ehfLines,
    taxTotals,
    lineNetTotal: oreToNok(invoice.subtotalOre),
    taxTotal: oreToNok(invoice.vatOre),
    payableAmount: oreToNok(invoice.totalOre),
    bankAccount: shop.senderBankAccount || undefined,
    iban: shop.senderIBAN || undefined,
    bic: shop.senderBIC || undefined,
    kid: invoice.kidNumber || undefined,
  };
}

// Types
interface ShopifyOrder {
  id: string;
  name: string;
  financialStatus: string;
  lineItems: Array<{
    id: string;
    title: string;
    variantTitle?: string;
    quantity: number;
    price: string;
    originalUnitPrice?: string;
  }>;
  shippingLines?: Array<{ title: string; price: string }>;
  customer?: { id: string };
}
