// app/lib/ehf/provider.ts
// Access Point adapter interface + implementations

export interface SendDocumentRequest {
  /** Idempotency key - use invoiceId */
  idempotencyKey: string;
  /** Sender Peppol participant ID, e.g. "0192:123456789" */
  senderParticipantId: string;
  /** Receiver Peppol participant ID, e.g. "0192:987654321" */
  receiverParticipantId: string;
  /** UBL 2.1 XML as string */
  documentXml: string;
  /** Document type ID - defaults to Peppol BIS Billing 3 */
  documentTypeId?: string;
}

export interface SendDocumentResponse {
  /** Provider's document reference ID */
  providerDocumentId: string;
  status: "queued" | "sent" | "failed";
  message?: string;
}

export interface PeppolProvider {
  name: string;
  sendDocument(req: SendDocumentRequest): Promise<SendDocumentResponse>;
  getDocumentStatus(providerDocumentId: string): Promise<{ status: string; details?: string }>;
}

// --- Mock provider (for dev/test) ---
export class MockPeppolProvider implements PeppolProvider {
  name = "mock";

  async sendDocument(req: SendDocumentRequest): Promise<SendDocumentResponse> {
    console.log("[MockPeppol] Sending document:", req.idempotencyKey);
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 100));
    return {
      providerDocumentId: `mock-${req.idempotencyKey}-${Date.now()}`,
      status: "queued",
      message: "Mock: document queued successfully",
    };
  }

  async getDocumentStatus(id: string): Promise<{ status: string }> {
    return { status: "delivered", details: `Mock status for ${id}` };
  }
}

// --- Storecove provider ---
// Based on Storecove REST API conventions.
// Adjust endpoint paths/payload shape as per their actual documentation.
export class StorecoveProvider implements PeppolProvider {
  name = "storecove";
  private apiUrl: string;
  private apiKey: string;
  private senderId: string;

  constructor(apiUrl: string, apiKey: string, senderId: string) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.senderId = senderId;
  }

  async sendDocument(req: SendDocumentRequest): Promise<SendDocumentResponse> {
    const url = `${this.apiUrl}/document_submissions`;
    const [receiverScheme, receiverNumber] = req.receiverParticipantId.split(":");

    const payload = {
      idempotency_guid: req.idempotencyKey,
      routing: {
        eIdentifiers: [
          {
            scheme: receiverScheme,
            id: receiverNumber,
          },
        ],
      },
      document: {
        document_type: req.documentTypeId ?? "invoice",
        data: Buffer.from(req.documentXml).toString("base64"),
      },
    };

    let attempt = 0;
    const maxAttempts = 3;
    let lastError: Error | null = null;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": req.idempotencyKey,
            "X-Sender-Participant-Id": this.senderId,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = (await res.json()) as { id?: string; guid?: string; status?: string };
          return {
            providerDocumentId: data.id ?? data.guid ?? `storecove-${Date.now()}`,
            status: "queued",
          };
        }

        if (res.status >= 400 && res.status < 500) {
          const body = await res.text();
          throw new Error(`Storecove client error ${res.status}: ${body}`);
        }

        // Server error - retry
        lastError = new Error(`Storecove server error ${res.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }

    throw lastError ?? new Error("Storecove: max retries exceeded");
  }

  async getDocumentStatus(id: string): Promise<{ status: string; details?: string }> {
    const res = await fetch(`${this.apiUrl}/document_submissions/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) return { status: "unknown", details: `HTTP ${res.status}` };
    const data = (await res.json()) as { status?: string };
    return { status: data.status ?? "unknown" };
  }
}

/**
 * Factory: create provider from environment or shop config.
 */
export function createPeppolProvider(overrides?: {
  provider?: string;
  apiUrl?: string;
  apiKey?: string;
  senderId?: string;
}): PeppolProvider {
  const provider = overrides?.provider ?? process.env.PEPPOL_PROVIDER ?? "mock";

  if (provider === "storecove") {
    const apiUrl = overrides?.apiUrl ?? process.env.STORECOVE_API_URL ?? "";
    const apiKey = overrides?.apiKey ?? process.env.STORECOVE_API_KEY ?? "";
    const senderId = overrides?.senderId ?? process.env.STORECOVE_SENDER_ID ?? "";
    if (!apiUrl || !apiKey || !senderId) {
      throw new Error("Storecove provider requires STORECOVE_API_URL, STORECOVE_API_KEY, STORECOVE_SENDER_ID");
    }
    return new StorecoveProvider(apiUrl, apiKey, senderId);
  }

  return new MockPeppolProvider();
}
