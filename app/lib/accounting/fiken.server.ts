// app/lib/accounting/fiken.server.ts
import type { AccountingProvider, AccountingCustomer, AccountingInvoice, PaymentUpdate } from "./interface";
import { db } from "~/db.server";
import { decrypt, encrypt } from "~/lib/crypto.server";
import { logger } from "~/lib/logger.server";

const FIKEN_API_BASE = "https://api.fiken.no/api/v2";

interface FikenTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export class FikenProvider implements AccountingProvider {
  name = "fiken";
  private shopId: string;
  private companySlug: string;
  private tokens: FikenTokens;

  constructor(shopId: string, companySlug: string, tokens: FikenTokens) {
    this.shopId = shopId;
    this.companySlug = companySlug;
    this.tokens = tokens;
  }

  private async getAccessToken(): Promise<string> {
    // Refresh if within 5 minutes of expiry
    if (this.tokens.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
      await this.refreshAccessToken();
    }
    return this.tokens.accessToken;
  }

  private async refreshAccessToken(): Promise<void> {
    const clientId = process.env.FIKEN_CLIENT_ID;
    const clientSecret = process.env.FIKEN_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("Fiken OAuth not configured");

    const res = await fetch("https://fiken.no/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.tokens.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) throw new Error(`Fiken token refresh failed: ${res.status}`);

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    };

    // Persist updated tokens
    await db.fikenIntegration.update({
      where: { shopId: this.shopId },
      data: {
        accessToken: await encrypt(data.access_token),
        refreshToken: await encrypt(data.refresh_token),
        tokenExpiresAt: expiresAt,
      },
    });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${FIKEN_API_BASE}/companies/${this.companySlug}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fiken API error ${res.status}: ${text}`);
    }

    if (res.status === 201 || res.headers.get("Content-Length") === "0") {
      // Extract ID from Location header
      const loc = res.headers.get("Location") ?? "";
      return { id: loc.split("/").pop() } as T;
    }

    return res.json() as T;
  }

  async syncCustomer(customer: AccountingCustomer): Promise<string> {
    // Search for existing customer
    const search = (await this.request<Array<{ customerId: number; name: string; organizationNumber?: string }>>(
      "GET",
      `/contacts?supplierOrCustomer=customer&organizationNumber=${customer.orgNr}`
    )) ?? [];

    if (search.length > 0) {
      return String(search[0].customerId);
    }

    // Create new
    const result = (await this.request<{ id: string }>("POST", "/contacts", {
      name: customer.name,
      email: customer.email,
      organizationNumber: customer.orgNr,
      customer: true,
    }));

    return result.id;
  }

  async syncInvoice(invoice: AccountingInvoice): Promise<string> {
    const fikenLines = invoice.lines.map((l) => ({
      text: l.description,
      quantity: l.quantity,
      unitPrice: Math.round(l.unitPrice * 100), // Fiken uses øre
      vatType: l.vatRate === 0.25 ? "HIGH" : l.vatRate === 0.15 ? "MEDIUM" : "NONE",
    }));

    const result = (await this.request<{ id: string }>("POST", "/sales", {
      date: invoice.issueDate,
      dueDate: invoice.dueDate,
      identifier: invoice.invoiceNumber,
      currency: invoice.currency,
      customer: { customerId: parseInt(invoice.customerExternalId, 10) },
      saleLines: fikenLines,
      paymentAccount: "1500:10001", // Kundefordringer
    }));

    return result.id;
  }

  async syncPayment(update: PaymentUpdate): Promise<void> {
    logger.info({ shopId: this.shopId, invoiceExternalId: update.invoiceExternalId }, "Fiken payment sync not yet implemented");
    // TODO: implement payment registration in Fiken
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("GET", "/contacts?limit=1");
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Load Fiken provider for a shop from the database.
 */
export async function getFikenProvider(shopId: string): Promise<FikenProvider | null> {
  const integration = await db.fikenIntegration.findUnique({
    where: { shopId },
  });

  if (!integration || !integration.isActive) return null;

  const accessToken = await decrypt(integration.accessToken);
  const refreshToken = await decrypt(integration.refreshToken);

  return new FikenProvider(shopId, integration.companySlug, {
    accessToken,
    refreshToken,
    expiresAt: integration.tokenExpiresAt ?? new Date(0),
  });
}
