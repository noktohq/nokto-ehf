// app/lib/ehf/types.ts

export interface EHFParty {
  name: string;
  orgNr: string;
  vatNr?: string;
  streetName?: string;
  city?: string;
  postalZone?: string;
  country: string; // ISO 3166-1 alpha-2
  peppolId?: string;
  email?: string;
}

export interface EHFLine {
  id: number;
  description: string;
  quantity: number;
  unitCode: string;     // UNECERec20 e.g. "EA"
  unitPriceNok: string; // ex VAT, 2 decimals
  lineNetNok: string;   // quantity * unitPriceNok, 2 decimals
  vatRate: number;      // 0.25
  vatCategoryCode: string; // "S" (standard) | "Z" (zero)
}

export interface EHFTaxTotal {
  taxAmount: string;       // sum of all VAT in NOK, 2 decimals
  taxableAmount: string;
  taxRate: number;
  taxCategoryCode: string;
}

export interface EHFInvoiceInput {
  customizationId: string;
  profileId: string;
  invoiceId: string;
  issueDate: string;       // YYYY-MM-DD
  dueDate: string;
  currencyCode: string;    // "NOK"
  orderReference?: string; // Shopify order name
  supplier: EHFParty;
  customer: EHFParty;
  lines: EHFLine[];
  taxTotals: EHFTaxTotal[];
  lineNetTotal: string;    // sum of all lineNetNok
  taxTotal: string;        // sum of all VAT
  payableAmount: string;   // grand total inc VAT
  bankAccount?: string;    // BBAN
  iban?: string;
  bic?: string;
  kid?: string;
  note?: string;
}
