// app/lib/pdf/generator.ts
// Generates invoice PDF using pdf-lib (no external process needed)
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { oreToNok } from "../validators";
import type { Invoice, InvoiceLine, B2BCustomer, Shop } from "@prisma/client";

type InvoiceWithRelations = Invoice & {
  lines: InvoiceLine[];
  b2bCustomer: B2BCustomer | null;
};

const COLORS = {
  black: rgb(0, 0, 0),
  darkGray: rgb(0.2, 0.2, 0.2),
  gray: rgb(0.5, 0.5, 0.5),
  lightGray: rgb(0.9, 0.9, 0.9),
  blue: rgb(0.12, 0.36, 0.67),
  white: rgb(1, 1, 1),
};

export async function generateInvoicePdf(
  invoice: InvoiceWithRelations,
  shop: Shop
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  let y = height - 40;

  // --- Header: Logo + Company info ---
  drawRect(page, 0, height - 80, width, 80, COLORS.blue);
  drawText(page, "FAKTURA", 40, height - 55, helveticaBold, 22, COLORS.white);
  drawText(page, shop.senderCompany, 40, height - 75, helvetica, 10, COLORS.white);

  // Invoice meta top right
  const metaX = width - 200;
  drawText(page, `Fakturanr: ${invoice.invoiceNumber}`, metaX, height - 45, helveticaBold, 10, COLORS.white);
  drawText(page, `Fakturadato: ${fmtDate(invoice.issueDate)}`, metaX, height - 60, helvetica, 9, COLORS.white);
  drawText(page, `Forfallsdato: ${fmtDate(invoice.dueDate)}`, metaX, height - 75, helvetica, 9, COLORS.white);

  y = height - 100;

  // --- Sender info ---
  drawText(page, "FRA", 40, y, helveticaBold, 8, COLORS.gray);
  y -= 14;
  drawText(page, shop.senderCompany, 40, y, helveticaBold, 10, COLORS.darkGray);
  y -= 13;
  if (shop.senderAddress) drawText(page, shop.senderAddress, 40, y, helvetica, 9, COLORS.darkGray), (y -= 13);
  if (shop.senderZip || shop.senderCity)
    drawText(page, `${shop.senderZip} ${shop.senderCity}`.trim(), 40, y, helvetica, 9, COLORS.darkGray), (y -= 13);
  if (shop.senderOrgNr) drawText(page, `Org.nr: ${shop.senderOrgNr}`, 40, y, helvetica, 9, COLORS.darkGray), (y -= 13);
  if (shop.senderEmail) drawText(page, shop.senderEmail, 40, y, helvetica, 9, COLORS.gray), (y -= 13);

  // --- Customer info ---
  const buyer = invoice.b2bCustomer;
  let cy = height - 100;
  drawText(page, "TIL", 300, cy, helveticaBold, 8, COLORS.gray);
  cy -= 14;
  if (buyer) {
    drawText(page, buyer.companyName, 300, cy, helveticaBold, 10, COLORS.darkGray);
    cy -= 13;
    drawText(page, `Org.nr: ${buyer.orgNr}`, 300, cy, helvetica, 9, COLORS.darkGray);
    cy -= 13;
    drawText(page, buyer.invoiceEmail, 300, cy, helvetica, 9, COLORS.gray);
    cy -= 13;
    if (buyer.reference) {
      drawText(page, `Ref: ${buyer.reference}`, 300, cy, helvetica, 9, COLORS.gray);
    }
  }

  y = Math.min(y, cy) - 20;

  // --- Shopify order reference ---
  drawText(page, `Ordrereferanse: ${invoice.shopifyOrderName}`, 40, y, helvetica, 9, COLORS.gray);
  if (invoice.kidNumber) {
    drawText(page, `KID: ${invoice.kidNumber}`, 300, y, helveticaBold, 9, COLORS.darkGray);
  }
  y -= 20;

  // --- Invoice lines table ---
  drawRect(page, 40, y - 16, width - 80, 16, COLORS.lightGray);
  drawText(page, "Beskrivelse", 44, y - 12, helveticaBold, 8, COLORS.darkGray);
  drawText(page, "Ant.", 350, y - 12, helveticaBold, 8, COLORS.darkGray);
  drawText(page, "Enhetspris", 390, y - 12, helveticaBold, 8, COLORS.darkGray);
  drawText(page, "MVA%", 460, y - 12, helveticaBold, 8, COLORS.darkGray);
  drawText(page, "Beløp", 510, y - 12, helveticaBold, 8, COLORS.darkGray);
  y -= 18;

  for (const line of invoice.lines) {
    drawText(page, line.description.slice(0, 60), 44, y, helvetica, 8, COLORS.darkGray);
    drawText(page, String(line.quantity), 354, y, helvetica, 8, COLORS.darkGray);
    drawText(page, `kr ${oreToNok(line.unitPriceOre)}`, 390, y, helvetica, 8, COLORS.darkGray);
    drawText(page, `${Math.round(line.vatRate * 100)}%`, 464, y, helvetica, 8, COLORS.darkGray);
    drawText(page, `kr ${oreToNok(line.lineNetOre)}`, 506, y, helvetica, 8, COLORS.darkGray);
    y -= 14;

    // Page overflow guard
    if (y < 80) break;
  }

  // --- Totals ---
  y -= 10;
  drawLine(page, 350, y, width - 40, y);
  y -= 14;
  drawText(page, "Netto ekskl. MVA:", 350, y, helvetica, 9, COLORS.darkGray);
  drawText(page, `kr ${oreToNok(invoice.subtotalOre)}`, 490, y, helvetica, 9, COLORS.darkGray);
  y -= 14;
  drawText(page, "MVA:", 350, y, helvetica, 9, COLORS.darkGray);
  drawText(page, `kr ${oreToNok(invoice.vatOre)}`, 490, y, helvetica, 9, COLORS.darkGray);
  y -= 4;
  drawLine(page, 350, y, width - 40, y);
  y -= 16;
  drawText(page, "Å BETALE:", 350, y, helveticaBold, 11, COLORS.blue);
  drawText(page, `kr ${oreToNok(invoice.totalOre)}`, 485, y, helveticaBold, 11, COLORS.blue);

  // --- Payment info ---
  y -= 30;
  if (shop.senderBankAccount) {
    drawText(page, `Bankkontonr: ${shop.senderBankAccount}`, 40, y, helvetica, 9, COLORS.darkGray);
    y -= 13;
  }
  if (shop.senderIBAN) {
    drawText(page, `IBAN: ${shop.senderIBAN}`, 40, y, helvetica, 9, COLORS.darkGray);
    y -= 13;
  }
  if (shop.senderBIC) {
    drawText(page, `BIC/SWIFT: ${shop.senderBIC}`, 40, y, helvetica, 9, COLORS.darkGray);
  }

  // --- Footer ---
  drawRect(page, 0, 0, width, 30, COLORS.lightGray);
  drawText(
    page,
    `${shop.senderCompany} | Org.nr: ${shop.senderOrgNr} | ${shop.senderEmail}`,
    40, 10, helvetica, 7, COLORS.gray
  );

  return pdfDoc.save();
}

// --- Drawing helpers ---

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>
) {
  page.drawText(text, { x, y, font, size, color });
}

function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  color: ReturnType<typeof rgb>
) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawLine(page: PDFPage, x1: number, y: number, x2: number, _y2: number) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color: COLORS.gray });
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
