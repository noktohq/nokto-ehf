// app/lib/ehf/generator.ts
// Generates EHF 3.0 (Peppol BIS Billing 3.0) compliant UBL 2.1 XML
import { create } from "xmlbuilder2";
import type { EHFInvoiceInput } from "./types";

export function generateEHFXml(invoice: EHFInvoiceInput): string {
  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("Invoice", {
      xmlns: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
      "xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      "xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    });

  // Header
  doc.ele("cbc:CustomizationID").txt(invoice.customizationId).up();
  doc.ele("cbc:ProfileID").txt(invoice.profileId).up();
  doc.ele("cbc:ID").txt(invoice.invoiceId).up();
  doc.ele("cbc:IssueDate").txt(invoice.issueDate).up();
  doc.ele("cbc:DueDate").txt(invoice.dueDate).up();
  doc.ele("cbc:InvoiceTypeCode").txt("380").up(); // 380 = Commercial invoice
  doc.ele("cbc:DocumentCurrencyCode").txt(invoice.currencyCode).up();
  doc.ele("cbc:TaxCurrencyCode").txt(invoice.currencyCode).up();

  if (invoice.note) {
    doc.ele("cbc:Note").txt(invoice.note).up();
  }

  // Order reference
  if (invoice.orderReference) {
    const orderRef = doc.ele("cac:OrderReference");
    orderRef.ele("cbc:ID").txt(invoice.orderReference).up();
    orderRef.up();
  }

  // Supplier (AccountingSupplierParty)
  const supplier = doc.ele("cac:AccountingSupplierParty").ele("cac:Party");
  if (invoice.supplier.peppolId) {
    supplier
      .ele("cbc:EndpointID", { schemeID: invoice.supplier.peppolId.split(":")[0] })
      .txt(invoice.supplier.peppolId.split(":")[1])
      .up();
  }
  addPartyTaxScheme(supplier, invoice.supplier.vatNr ?? invoice.supplier.orgNr, "VAT");
  addPartyLegalEntity(supplier, invoice.supplier.name, invoice.supplier.orgNr);
  addPostalAddress(supplier, invoice.supplier);
  if (invoice.supplier.email) {
    supplier.ele("cac:Contact").ele("cbc:ElectronicMail").txt(invoice.supplier.email).up().up();
  }
  supplier.up().up(); // Party + AccountingSupplierParty

  // Customer (AccountingCustomerParty)
  const customer = doc.ele("cac:AccountingCustomerParty").ele("cac:Party");
  if (invoice.customer.peppolId) {
    customer
      .ele("cbc:EndpointID", { schemeID: invoice.customer.peppolId.split(":")[0] })
      .txt(invoice.customer.peppolId.split(":")[1])
      .up();
  }
  addPartyTaxScheme(customer, invoice.customer.vatNr ?? `NO${invoice.customer.orgNr}MVA`, "VAT");
  addPartyLegalEntity(customer, invoice.customer.name, invoice.customer.orgNr);
  addPostalAddress(customer, invoice.customer);
  if (invoice.customer.email) {
    customer.ele("cac:Contact").ele("cbc:ElectronicMail").txt(invoice.customer.email).up().up();
  }
  customer.up().up();

  // PaymentMeans
  const pm = doc.ele("cac:PaymentMeans");
  pm.ele("cbc:PaymentMeansCode").txt("30").up(); // 30 = Credit transfer
  if (invoice.kid) {
    pm.ele("cbc:PaymentID").txt(invoice.kid).up();
  }
  if (invoice.iban || invoice.bankAccount) {
    const fa = pm.ele("cac:PayeeFinancialAccount");
    fa.ele("cbc:ID").txt(invoice.iban ?? invoice.bankAccount ?? "").up();
    if (invoice.bic) {
      fa.ele("cac:FinancialInstitutionBranch")
        .ele("cac:FinancialInstitution")
        .ele("cbc:ID").txt(invoice.bic).up()
        .up().up();
    }
    fa.up();
  }
  pm.up();

  // PaymentTerms
  const pt = doc.ele("cac:PaymentTerms");
  pt.ele("cbc:Note").txt(`Net ${invoice.dueDate}`).up();
  pt.up();

  // TaxTotal
  for (const tax of invoice.taxTotals) {
    const tt = doc.ele("cac:TaxTotal");
    tt.ele("cbc:TaxAmount", { currencyID: invoice.currencyCode }).txt(tax.taxAmount).up();
    const ts = tt.ele("cac:TaxSubtotal");
    ts.ele("cbc:TaxableAmount", { currencyID: invoice.currencyCode }).txt(tax.taxableAmount).up();
    ts.ele("cbc:TaxAmount", { currencyID: invoice.currencyCode }).txt(tax.taxAmount).up();
    const tc = ts.ele("cac:TaxCategory");
    tc.ele("cbc:ID").txt(tax.taxCategoryCode).up();
    tc.ele("cbc:Percent").txt(String(tax.taxRate * 100)).up();
    tc.ele("cac:TaxScheme").ele("cbc:ID").txt("VAT").up().up();
    tc.up();
    ts.up();
    tt.up();
  }

  // LegalMonetaryTotal
  const lmt = doc.ele("cac:LegalMonetaryTotal");
  lmt.ele("cbc:LineExtensionAmount", { currencyID: invoice.currencyCode }).txt(invoice.lineNetTotal).up();
  lmt.ele("cbc:TaxExclusiveAmount", { currencyID: invoice.currencyCode }).txt(invoice.lineNetTotal).up();
  lmt.ele("cbc:TaxInclusiveAmount", { currencyID: invoice.currencyCode }).txt(invoice.payableAmount).up();
  lmt.ele("cbc:PayableAmount", { currencyID: invoice.currencyCode }).txt(invoice.payableAmount).up();
  lmt.up();

  // InvoiceLines
  for (const line of invoice.lines) {
    const il = doc.ele("cac:InvoiceLine");
    il.ele("cbc:ID").txt(String(line.id)).up();
    il.ele("cbc:InvoicedQuantity", { unitCode: line.unitCode }).txt(String(line.quantity)).up();
    il.ele("cbc:LineExtensionAmount", { currencyID: invoice.currencyCode }).txt(line.lineNetNok).up();

    const ltt = il.ele("cac:TaxTotal");
    const lineTax = (parseFloat(line.lineNetNok) * line.vatRate).toFixed(2);
    ltt.ele("cbc:TaxAmount", { currencyID: invoice.currencyCode }).txt(lineTax).up();
    ltt.up();

    const item = il.ele("cac:Item");
    item.ele("cbc:Description").txt(line.description).up();
    item.ele("cbc:Name").txt(line.description.slice(0, 100)).up();
    const lineTc = item.ele("cac:ClassifiedTaxCategory");
    lineTc.ele("cbc:ID").txt(line.vatCategoryCode).up();
    lineTc.ele("cbc:Percent").txt(String(line.vatRate * 100)).up();
    lineTc.ele("cac:TaxScheme").ele("cbc:ID").txt("VAT").up().up();
    lineTc.up();
    item.up();

    const price = il.ele("cac:Price");
    price.ele("cbc:PriceAmount", { currencyID: invoice.currencyCode }).txt(line.unitPriceNok).up();
    price.up();

    il.up();
  }

  return doc.end({ prettyPrint: true });
}

// --- Helpers ---

function addPartyTaxScheme(party: ReturnType<typeof create>, vatId: string, scheme: string) {
  const pts = party.ele("cac:PartyTaxScheme");
  pts.ele("cbc:CompanyID").txt(vatId).up();
  pts.ele("cac:TaxScheme").ele("cbc:ID").txt(scheme).up().up();
  pts.up();
}

function addPartyLegalEntity(party: ReturnType<typeof create>, name: string, orgNr: string) {
  const ple = party.ele("cac:PartyLegalEntity");
  ple.ele("cbc:RegistrationName").txt(name).up();
  ple.ele("cbc:CompanyID", { schemeID: "0192" }).txt(orgNr).up();
  ple.up();
}

function addPostalAddress(
  party: ReturnType<typeof create>,
  p: { streetName?: string; city?: string; postalZone?: string; country: string }
) {
  const pa = party.ele("cac:PostalAddress");
  if (p.streetName) pa.ele("cbc:StreetName").txt(p.streetName).up();
  if (p.city) pa.ele("cbc:CityName").txt(p.city).up();
  if (p.postalZone) pa.ele("cbc:PostalZone").txt(p.postalZone).up();
  pa.ele("cac:Country").ele("cbc:IdentificationCode").txt(p.country).up().up();
  pa.up();
}

/**
 * Validate that all mandatory fields are present before sending.
 * Returns array of error strings (empty = valid).
 */
export function validateEHFInput(inv: EHFInvoiceInput): string[] {
  const errors: string[] = [];
  if (!inv.invoiceId) errors.push("Missing invoiceId");
  if (!inv.issueDate) errors.push("Missing issueDate");
  if (!inv.dueDate) errors.push("Missing dueDate");
  if (!inv.supplier.orgNr) errors.push("Missing supplier orgNr");
  if (!inv.supplier.name) errors.push("Missing supplier name");
  if (!inv.customer.orgNr) errors.push("Missing customer orgNr");
  if (!inv.customer.name) errors.push("Missing customer name");
  if (!inv.customer.peppolId) errors.push("Missing customer peppolId");
  if (inv.lines.length === 0) errors.push("No invoice lines");
  if (!inv.payableAmount || parseFloat(inv.payableAmount) < 0) errors.push("Invalid payableAmount");
  return errors;
}
