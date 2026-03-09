// tests/unit/invoice-totals.test.ts
import { describe, it, expect } from "vitest";
import { nokToOre, oreToNok } from "../../app/lib/validators";

/**
 * Test invoice total calculation logic.
 * Mirrors what buildInvoiceFromOrder does.
 */
function calculateInvoiceTotals(lines: Array<{ qty: number; unitPriceNok: string; vatRate: number }>) {
  let subtotalOre = 0;
  let vatOre = 0;

  const processedLines = lines.map((line, i) => {
    const unitPriceOre = nokToOre(line.unitPriceNok);
    const lineNetOre = Math.round(line.qty * unitPriceOre);
    const lineVatOre = Math.round(lineNetOre * line.vatRate);

    subtotalOre += lineNetOre;
    vatOre += lineVatOre;

    return {
      lineNum: i + 1,
      unitPriceOre,
      lineNetOre,
      vatOre: lineVatOre,
      lineTotalOre: lineNetOre + lineVatOre,
    };
  });

  return {
    lines: processedLines,
    subtotalOre,
    vatOre,
    totalOre: subtotalOre + vatOre,
  };
}

describe("Invoice total calculations", () => {
  it("calculates simple single-line invoice", () => {
    const result = calculateInvoiceTotals([{ qty: 1, unitPriceNok: "1000.00", vatRate: 0.25 }]);

    expect(result.subtotalOre).toBe(100000);
    expect(result.vatOre).toBe(25000);
    expect(result.totalOre).toBe(125000);
    expect(oreToNok(result.totalOre)).toBe("1250.00");
  });

  it("calculates multi-line invoice", () => {
    const result = calculateInvoiceTotals([
      { qty: 2, unitPriceNok: "500.00", vatRate: 0.25 },
      { qty: 1, unitPriceNok: "200.00", vatRate: 0.25 },
    ]);

    expect(result.subtotalOre).toBe(120000); // 100000 + 20000
    expect(result.vatOre).toBe(30000);       // 25000 + 5000
    expect(result.totalOre).toBe(150000);
  });

  it("handles fractional quantities", () => {
    const result = calculateInvoiceTotals([{ qty: 1.5, unitPriceNok: "100.00", vatRate: 0.25 }]);

    expect(result.subtotalOre).toBe(15000);
    expect(result.vatOre).toBe(3750);
    expect(result.totalOre).toBe(18750);
  });

  it("handles zero VAT rate", () => {
    const result = calculateInvoiceTotals([{ qty: 1, unitPriceNok: "100.00", vatRate: 0 }]);

    expect(result.subtotalOre).toBe(10000);
    expect(result.vatOre).toBe(0);
    expect(result.totalOre).toBe(10000);
  });

  it("line total equals net + VAT", () => {
    const result = calculateInvoiceTotals([{ qty: 3, unitPriceNok: "750.00", vatRate: 0.25 }]);

    for (const line of result.lines) {
      expect(line.lineTotalOre).toBe(line.lineNetOre + line.vatOre);
    }
  });

  it("grand total equals sum of line totals", () => {
    const lines = [
      { qty: 2, unitPriceNok: "499.00", vatRate: 0.25 },
      { qty: 5, unitPriceNok: "99.90", vatRate: 0.25 },
      { qty: 1, unitPriceNok: "1250.00", vatRate: 0.15 },
    ];
    const result = calculateInvoiceTotals(lines);

    const sumOfLineTotals = result.lines.reduce((sum, l) => sum + l.lineTotalOre, 0);
    expect(result.totalOre).toBe(sumOfLineTotals);
  });

  it("handles NOK amounts with precision", () => {
    // 3 * 333.33 = 999.99
    const result = calculateInvoiceTotals([{ qty: 3, unitPriceNok: "333.33", vatRate: 0.25 }]);

    expect(result.subtotalOre).toBe(99999);
    expect(oreToNok(result.subtotalOre)).toBe("999.99");
  });
});
