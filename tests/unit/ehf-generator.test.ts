// tests/unit/ehf-generator.test.ts
import { describe, it, expect } from "vitest";
import { generateEHFXml, validateEHFInput } from "../../app/lib/ehf/generator";
import type { EHFInvoiceInput } from "../../app/lib/ehf/types";

const SAMPLE_INVOICE: EHFInvoiceInput = {
  customizationId: "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
  profileId: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
  invoiceId: "INV-2025-0001",
  issueDate: "2025-01-15",
  dueDate: "2025-01-29",
  currencyCode: "NOK",
  orderReference: "#1001",
  supplier: {
    name: "Demo AS",
    orgNr: "123456789",
    vatNr: "NO123456789MVA",
    streetName: "Storgata 1",
    city: "Oslo",
    postalZone: "0182",
    country: "NO",
    peppolId: "0192:123456789",
    email: "faktura@demo.no",
  },
  customer: {
    name: "Kunde AS",
    orgNr: "974760673",
    country: "NO",
    peppolId: "0192:974760673",
    email: "regnskap@kunde.no",
  },
  lines: [
    {
      id: 1,
      description: "Konsultasjon",
      quantity: 10,
      unitCode: "EA",
      unitPriceNok: "1000.00",
      lineNetNok: "10000.00",
      vatRate: 0.25,
      vatCategoryCode: "S",
    },
    {
      id: 2,
      description: "Reisekostnader",
      quantity: 1,
      unitCode: "EA",
      unitPriceNok: "500.00",
      lineNetNok: "500.00",
      vatRate: 0.25,
      vatCategoryCode: "S",
    },
  ],
  taxTotals: [
    {
      taxAmount: "2625.00",
      taxableAmount: "10500.00",
      taxRate: 0.25,
      taxCategoryCode: "S",
    },
  ],
  lineNetTotal: "10500.00",
  taxTotal: "2625.00",
  payableAmount: "13125.00",
  bankAccount: "1234.56.78901",
  iban: "NO9312345678901",
  bic: "DNBANOKKXXX",
  kid: "123456789012345",
};

describe("generateEHFXml", () => {
  it("generates valid XML string", () => {
    const xml = generateEHFXml(SAMPLE_INVOICE);
    expect(typeof xml).toBe("string");
    expect(xml.length).toBeGreaterThan(500);
  });

  it("contains XML declaration", () => {
    const xml = generateEHFXml(SAMPLE_INVOICE);
    expect(xml).toContain('<?xml version="1.0"');
  });

  it("contains CustomizationID", () => {
    const xml = generateEHFXml(SAMPLE_INVOICE);
    expect(xml).toContain("urn:cen.eu:en16931:2017");
  });

  it("contains invoice ID", () => {
    const xml = generateEHFXml(SAMPLE_INVOICE);
    expect(xml).toContain("INV-2025-0001");
  });

  it("contains supplier name", () => {
    const xml = generateEHFXml(SAMPLE_INVOICE);
    expect(xml).toContain("Demo AS");
  });

  it("contains customer Peppol endpoint", () => {
    const xml = generateEHFXml(SAMPLE_INVOICE);
    expect(xml).toContain("974760673");
    expect(xml).toContain("0192");
  });

  it("contains payable amount", () => {
    const xml = generateEHFXml(SAMPLE_INVOICE);
    expect(xml).toContain("13125.00");
  });

  it("contains KID in PaymentID", () => {
    const xml = generateEHFXml(SAMPLE_INVOICE);
    expect(xml).toContain("123456789012345");
  });

  it("contains both invoice lines", () => {
    const xml = generateEHFXml(SAMPLE_INVOICE);
    expect(xml).toContain("Konsultasjon");
    expect(xml).toContain("Reisekostnader");
  });

  it("snapshot matches expected structure", () => {
    const xml = generateEHFXml(SAMPLE_INVOICE);

    // Key structural elements
    expect(xml).toContain("<Invoice ");
    expect(xml).toContain("AccountingSupplierParty");
    expect(xml).toContain("AccountingCustomerParty");
    expect(xml).toContain("LegalMonetaryTotal");
    expect(xml).toContain("TaxTotal");
    expect(xml).toContain("InvoiceLine");
    expect(xml).toContain("PaymentMeans");
  });
});

describe("validateEHFInput", () => {
  it("returns empty array for valid input", () => {
    const errors = validateEHFInput(SAMPLE_INVOICE);
    expect(errors).toHaveLength(0);
  });

  it("returns error for missing invoiceId", () => {
    const errors = validateEHFInput({ ...SAMPLE_INVOICE, invoiceId: "" });
    expect(errors).toContain("Missing invoiceId");
  });

  it("returns error for missing customer peppolId", () => {
    const errors = validateEHFInput({
      ...SAMPLE_INVOICE,
      customer: { ...SAMPLE_INVOICE.customer, peppolId: undefined },
    });
    expect(errors).toContain("Missing customer peppolId");
  });

  it("returns error for empty lines", () => {
    const errors = validateEHFInput({ ...SAMPLE_INVOICE, lines: [] });
    expect(errors).toContain("No invoice lines");
  });

  it("returns multiple errors when multiple fields missing", () => {
    const errors = validateEHFInput({
      ...SAMPLE_INVOICE,
      invoiceId: "",
      issueDate: "",
      lines: [],
    });
    expect(errors.length).toBeGreaterThan(1);
  });
});
