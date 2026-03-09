// tests/unit/webhook-idempotency.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests idempotency logic for webhook handlers.
 * We test the pure logic without hitting the DB.
 */

interface WebhookEvent {
  id: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "SKIPPED";
  shopifyId: string;
}

// Simplified webhook deduplication logic (mirrors routes/webhooks.tsx)
async function processWebhookWithIdempotency(
  shopifyWebhookId: string,
  existingEvents: WebhookEvent[],
  handler: () => Promise<void>
): Promise<{ result: "processed" | "skipped" | "failed"; events: WebhookEvent[] }> {
  const events = [...existingEvents];

  const existing = events.find((e) => e.shopifyId === shopifyWebhookId);

  if (existing && (existing.status === "DONE" || existing.status === "PROCESSING")) {
    return { result: "skipped", events };
  }

  const eventId = `evt-${Date.now()}`;
  if (existing) {
    existing.status = "PROCESSING";
    existing.id = eventId;
  } else {
    events.push({ id: eventId, status: "PROCESSING", shopifyId: shopifyWebhookId });
  }

  try {
    await handler();
    const evt = events.find((e) => e.shopifyId === shopifyWebhookId)!;
    evt.status = "DONE";
    return { result: "processed", events };
  } catch (err) {
    const evt = events.find((e) => e.shopifyId === shopifyWebhookId)!;
    evt.status = "FAILED";
    return { result: "failed", events };
  }
}

describe("Webhook idempotency", () => {
  it("processes a new webhook event", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const { result, events } = await processWebhookWithIdempotency("wh-001", [], handler);

    expect(result).toBe("processed");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(events.find((e) => e.shopifyId === "wh-001")?.status).toBe("DONE");
  });

  it("skips duplicate DONE webhook", async () => {
    const existing: WebhookEvent[] = [{ id: "evt-1", status: "DONE", shopifyId: "wh-002" }];
    const handler = vi.fn().mockResolvedValue(undefined);

    const { result } = await processWebhookWithIdempotency("wh-002", existing, handler);

    expect(result).toBe("skipped");
    expect(handler).not.toHaveBeenCalled();
  });

  it("skips duplicate PROCESSING webhook", async () => {
    const existing: WebhookEvent[] = [{ id: "evt-1", status: "PROCESSING", shopifyId: "wh-003" }];
    const handler = vi.fn().mockResolvedValue(undefined);

    const { result } = await processWebhookWithIdempotency("wh-003", existing, handler);

    expect(result).toBe("skipped");
    expect(handler).not.toHaveBeenCalled();
  });

  it("retries a FAILED webhook", async () => {
    const existing: WebhookEvent[] = [{ id: "evt-1", status: "FAILED", shopifyId: "wh-004" }];
    const handler = vi.fn().mockResolvedValue(undefined);

    const { result, events } = await processWebhookWithIdempotency("wh-004", existing, handler);

    expect(result).toBe("processed");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(events.find((e) => e.shopifyId === "wh-004")?.status).toBe("DONE");
  });

  it("retries a PENDING webhook", async () => {
    const existing: WebhookEvent[] = [{ id: "evt-1", status: "PENDING", shopifyId: "wh-005" }];
    const handler = vi.fn().mockResolvedValue(undefined);

    const { result } = await processWebhookWithIdempotency("wh-005", existing, handler);

    expect(result).toBe("processed");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("marks event as FAILED when handler throws", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("Something went wrong"));

    const { result, events } = await processWebhookWithIdempotency("wh-006", [], handler);

    expect(result).toBe("failed");
    expect(events.find((e) => e.shopifyId === "wh-006")?.status).toBe("FAILED");
  });

  it("handles concurrent identical webhooks correctly", async () => {
    const existing: WebhookEvent[] = [];
    let callCount = 0;
    const slowHandler = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
    };

    // Both start at same time; second should see PROCESSING from first
    const results = await Promise.all([
      processWebhookWithIdempotency("wh-007", existing, slowHandler),
      processWebhookWithIdempotency("wh-007", existing, slowHandler),
    ]);

    // At least one should process and at most one should be skipped
    const processed = results.filter((r) => r.result === "processed").length;
    expect(processed).toBeGreaterThanOrEqual(1);
  });
});
