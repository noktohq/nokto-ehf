// app/lib/accounting/interface.ts

export interface AccountingCustomer {
  id: string; // external ID
  name: string;
  orgNr: string;
  email: string;
}

export interface AccountingInvoice {
  externalId: string; // Nokto invoice ID
  invoiceNumber: string;
  issueDate: string;   // YYYY-MM-DD
  dueDate: string;
  customerExternalId: string;
  currency: string;
  lines: AccountingInvoiceLine[];
  totalAmountNok: number;
  vatAmountNok: number;
}

export interface AccountingInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number; // ex VAT
  vatRate: number;   // 0.25
}

export interface PaymentUpdate {
  invoiceExternalId: string;
  amountNok: number;
  paidDate: string;
}

export interface AccountingProvider {
  name: string;
  syncCustomer(customer: AccountingCustomer): Promise<string>; // returns provider customer ID
  syncInvoice(invoice: AccountingInvoice): Promise<string>;    // returns provider invoice ID
  syncPayment(update: PaymentUpdate): Promise<void>;
  testConnection(): Promise<boolean>;
}
