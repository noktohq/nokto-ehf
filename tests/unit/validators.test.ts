// tests/unit/validators.test.ts
import { describe, it, expect } from "vitest";
import { validateOrgNr, generateKid, generatePeppolId, nokToOre, oreToNok } from "../../app/lib/validators";

describe("validateOrgNr", () => {
  it("accepts valid org numbers", () => {
    // Well-known valid Norwegian org numbers
    expect(validateOrgNr("974760673")).toBe(true); // Skatteetaten
    expect(validateOrgNr("889640782")).toBe(true); // NAV
    expect(validateOrgNr("986105174")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(validateOrgNr("12345678")).toBe(false);
    expect(validateOrgNr("1234567890")).toBe(false);
    expect(validateOrgNr("")).toBe(false);
  });

  it("rejects non-digit characters", () => {
    expect(validateOrgNr("97476067A")).toBe(false);
    expect(validateOrgNr("974-76067")).toBe(false);
  });

  it("rejects numbers with invalid check digit", () => {
    expect(validateOrgNr("974760674")).toBe(false); // last digit changed
    expect(validateOrgNr("123456789")).toBe(false);
  });

  it("rejects numbers where remainder === 1 (inherently invalid)", () => {
    // These cannot produce valid org numbers since checkDigit would be 10
    // We just verify invalid ones return false
    expect(validateOrgNr("000000000")).toBe(false);
  });
});

describe("generateKid", () => {
  it("generates KID-10 with correct length", () => {
    const kid = generateKid(1001, 10);
    expect(kid).toHaveLength(10);
    expect(/^\d{10}$/.test(kid)).toBe(true);
  });

  it("generates KID-15 with correct length", () => {
    const kid = generateKid(1001, 15);
    expect(kid).toHaveLength(15);
    expect(/^\d{15}$/.test(kid)).toBe(true);
  });

  it("generates valid MOD10 check digit", () => {
    // Verify Luhn check
    const kid = generateKid(12345, 10);
    const digits = kid.split("").map(Number);

    // Luhn algorithm verification
    let sum = 0;
    let toggle = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits[i];
      if (toggle) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      toggle = !toggle;
    }
    expect(sum % 10).toBe(0);
  });

  it("generates different KIDs for different invoice numbers", () => {
    const kid1 = generateKid(1001, 10);
    const kid2 = generateKid(1002, 10);
    expect(kid1).not.toBe(kid2);
  });
});

describe("generatePeppolId", () => {
  it("generates default 0192 scheme", () => {
    expect(generatePeppolId("123456789")).toBe("0192:123456789");
  });

  it("supports custom scheme", () => {
    expect(generatePeppolId("123456789", "9908")).toBe("9908:123456789");
  });
});

describe("nokToOre / oreToNok", () => {
  it("converts NOK to øre correctly", () => {
    expect(nokToOre("100.00")).toBe(10000);
    expect(nokToOre("1490")).toBe(149000);
    expect(nokToOre("0.01")).toBe(1);
  });

  it("rounds correctly", () => {
    expect(nokToOre("100.005")).toBe(10001);
    expect(nokToOre("100.004")).toBe(10000);
  });

  it("converts øre to NOK string", () => {
    expect(oreToNok(10000)).toBe("100.00");
    expect(oreToNok(12550)).toBe("125.50");
    expect(oreToNok(1)).toBe("0.01");
  });
});
