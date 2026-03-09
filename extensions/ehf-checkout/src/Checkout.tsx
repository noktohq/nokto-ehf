import {
  reactExtension,
  useApplyAttributeChange,
  useAttributeValues,
  BlockStack,
  TextField,
  Heading,
  Text,
  Divider,
  Button,
  Banner,
  InlineStack,
  Spinner,
} from "@shopify/ui-extensions-react/checkout";
import { useState, useCallback, useRef } from "react";

const BRREG_API = "https://data.brreg.no/enhetsregisteret/api/enheter";

export default reactExtension(
  "purchase.checkout.payment-method-list.render-after",
  () => <EhfCheckout />
);

type LookupState = "idle" | "loading" | "found" | "error" | "not_found";

function EhfCheckout() {
  const applyAttributeChange = useApplyAttributeChange();

  const [existingOrg, existingCompany, existingRef, existingEhf] = useAttributeValues([
    "_ehf_org_nr",
    "_ehf_company_name",
    "_ehf_reference",
    "_ehf_invoice_requested",
  ]);

  const [expanded, setExpanded] = useState(existingEhf === "true");
  const [confirmed, setConfirmed] = useState(existingEhf === "true");

  const [orgNr, setOrgNr] = useState(existingOrg ?? "");
  const [companyName, setCompanyName] = useState(existingCompany ?? "");
  const [reference, setReference] = useState(existingRef ?? "");

  const [lookupState, setLookupState] = useState<LookupState>(
    existingCompany ? "found" : "idle"
  );
  const [orgError, setOrgError] = useState("");
  const [showManualName, setShowManualName] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // MOD11 validation
  const isValidOrgNr = useCallback((nr: string): boolean => {
    const d = nr.replace(/\s/g, "");
    if (!/^\d{9}$/.test(d)) return false;
    const weights = [3, 2, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * parseInt(d[i]), 0);
    const rem = sum % 11;
    const check = rem === 0 ? 0 : 11 - rem;
    if (check === 10) return false;
    return check === parseInt(d[8]);
  }, []);

  // Brreg API lookup
  const lookupBrreg = useCallback(async (nr: string) => {
    setLookupState("loading");
    setCompanyName("");
    setShowManualName(false);

    try {
      const res = await fetch(`${BRREG_API}/${nr}`);
      if (res.ok) {
        const data = (await res.json()) as { navn?: string };
        if (data.navn) {
          setCompanyName(data.navn);
          setLookupState("found");
        } else {
          setLookupState("error");
          setShowManualName(true);
        }
      } else if (res.status === 404) {
        setOrgError("Organisasjonsnummeret ble ikke funnet i Brønnøysundregistrene");
        setLookupState("not_found");
      } else {
        setLookupState("error");
        setShowManualName(true);
      }
    } catch {
      setLookupState("error");
      setShowManualName(true);
    }
  }, []);

  // Org.nr input handler with debounced Brreg lookup
  const handleOrgNr = useCallback(
    (value: string) => {
      // Only allow digits
      const cleaned = value.replace(/\D/g, "").slice(0, 9);
      setOrgNr(cleaned);
      setOrgError("");
      setLookupState("idle");
      setCompanyName("");
      setShowManualName(false);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (cleaned.length === 9) {
        if (!isValidOrgNr(cleaned)) {
          setOrgError("Ugyldig organisasjonsnummer");
          return;
        }
        // Small delay so lookup doesn't fire on every keystroke
        debounceRef.current = setTimeout(() => lookupBrreg(cleaned), 400);
      }
    },
    [isValidOrgNr, lookupBrreg]
  );

  // Confirm: write all attributes to the order
  const handleConfirm = useCallback(async () => {
    const digits = orgNr.replace(/\s/g, "");

    if (!isValidOrgNr(digits)) {
      setOrgError("Ugyldig organisasjonsnummer");
      return;
    }
    if (!companyName.trim()) return;

    await Promise.all([
      applyAttributeChange({ type: "updateAttribute", key: "_ehf_invoice_requested", value: "true" }),
      applyAttributeChange({ type: "updateAttribute", key: "_ehf_org_nr", value: digits }),
      applyAttributeChange({ type: "updateAttribute", key: "_ehf_company_name", value: companyName.trim() }),
      applyAttributeChange({ type: "updateAttribute", key: "_ehf_reference", value: reference.trim() }),
    ]);

    setConfirmed(true);
  }, [applyAttributeChange, orgNr, companyName, reference, isValidOrgNr]);

  // Cancel: clear all attributes
  const handleCancel = useCallback(async () => {
    setExpanded(false);
    setConfirmed(false);
    setOrgNr("");
    setCompanyName("");
    setReference("");
    setOrgError("");
    setLookupState("idle");
    setShowManualName(false);

    await Promise.all([
      applyAttributeChange({ type: "updateAttribute", key: "_ehf_invoice_requested", value: "" }),
      applyAttributeChange({ type: "updateAttribute", key: "_ehf_org_nr", value: "" }),
      applyAttributeChange({ type: "updateAttribute", key: "_ehf_company_name", value: "" }),
      applyAttributeChange({ type: "updateAttribute", key: "_ehf_reference", value: "" }),
    ]);
  }, [applyAttributeChange]);

  // ── Confirmed state ────────────────────────────────────────────────────────
  if (confirmed) {
    const displayOrg = existingOrg ?? orgNr;
    const displayCompany = existingCompany ?? companyName;
    return (
      <BlockStack spacing="base">
        <Divider />
        <Banner status="success" title="EHF-faktura er registrert">
          <Text>
            Faktura sendes elektronisk via EHF til {displayCompany} (org.nr {displayOrg}).
            Betalingsbetingelser: 14 dager netto.
          </Text>
        </Banner>
        <Button kind="plain" onPress={handleCancel}>
          Avbryt EHF-faktura
        </Button>
      </BlockStack>
    );
  }

  // ── Collapsed state ────────────────────────────────────────────────────────
  if (!expanded) {
    return (
      <BlockStack spacing="base">
        <Divider />
        <BlockStack spacing="tight">
          <Heading level={3}>Faktura til bedrift (EHF)</Heading>
          <Text appearance="subdued" size="small">
            Bedriftskunder kan motta faktura elektronisk i regnskapssystemet via Peppol/EHF-nettverket.
          </Text>
        </BlockStack>
        <Button kind="secondary" onPress={() => setExpanded(true)}>
          Betal med EHF-faktura
        </Button>
      </BlockStack>
    );
  }

  // ── Expanded (form) state ──────────────────────────────────────────────────
  const canConfirm =
    isValidOrgNr(orgNr) &&
    companyName.trim().length > 0 &&
    lookupState !== "loading";

  return (
    <BlockStack spacing="base">
      <Divider />
      <Heading level={3}>Bedriftsinformasjon for EHF-faktura</Heading>
      <Text appearance="subdued" size="small">
        Skriv inn organisasjonsnummeret — firmanavnet hentes automatisk fra Brønnøysundregistrene.
      </Text>

      {/* Org.nr input */}
      <TextField
        label="Organisasjonsnummer"
        value={orgNr}
        onChange={handleOrgNr}
        error={orgError || undefined}
        required
        autocomplete={false}
        placeholder="987654321"
      />

      {/* Brreg lookup feedback */}
      {lookupState === "loading" && (
        <InlineStack spacing="tight" blockAlignment="center">
          <Spinner size="small" />
          <Text appearance="subdued" size="small">Henter firmanavn fra Brønnøysundregistrene...</Text>
        </InlineStack>
      )}

      {lookupState === "found" && companyName && (
        <Banner status="success">
          <Text>✓ {companyName}</Text>
        </Banner>
      )}

      {lookupState === "error" && (
        <Banner status="warning" title="Kunne ikke hente firmanavn automatisk">
          <Text size="small">Skriv inn firmanavnet manuelt under.</Text>
        </Banner>
      )}

      {/* Manual fallback input shown only when Brreg fails */}
      {showManualName && (
        <TextField
          label="Firmanavn"
          value={companyName}
          onChange={setCompanyName}
          required
          autocomplete={false}
          placeholder="Skriv inn firmanavn"
        />
      )}

      {/* Optional reference */}
      <TextField
        label="Referanse / bestiller (valgfritt)"
        value={reference}
        onChange={setReference}
        autocomplete={false}
        placeholder="F.eks. prosjektnummer eller bestiller"
      />

      <Button
        kind="primary"
        onPress={handleConfirm}
        disabled={!canConfirm}
        loading={lookupState === "loading"}
      >
        Bekreft EHF-faktura
      </Button>
      <Button kind="plain" onPress={handleCancel}>
        Avbryt
      </Button>
    </BlockStack>
  );
}
