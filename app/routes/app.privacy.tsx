// app/routes/app.privacy.tsx
// Required by Shopify App Store – must be accessible without authentication
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Personvernpolicy – Nokto EHF" },
];

export default function PrivacyPolicy() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px", fontFamily: "sans-serif", lineHeight: 1.6 }}>
      <h1>Personvernpolicy for Nokto EHF</h1>
      <p><em>Sist oppdatert: mars 2026</em></p>

      <h2>1. Behandlingsansvarlig</h2>
      <p>
        Nokto AS («vi», «oss») er behandlingsansvarlig for personopplysninger som behandles i
        forbindelse med Shopify-appen Nokto EHF.
        Kontakt: <a href="mailto:personvern@nokto.no">personvern@nokto.no</a>
      </p>

      <h2>2. Hvilke opplysninger samler vi inn?</h2>
      <ul>
        <li><strong>Butikkdata:</strong> Shopify-butikkens domene, tilgangstoken (kryptert) og konfigurasjonsinnstillinger.</li>
        <li><strong>Ordredata:</strong> Ordrenummer, linjeartikler, beløp og betalingsstatus – nødvendig for å generere faktura.</li>
        <li><strong>B2B-kundeopplysninger:</strong> Organisasjonsnummer, firmanavn, e-postadresse for faktura, referanse og EHF/Peppol-identifikator.</li>
        <li><strong>Fakturaer:</strong> Genererte EHF-fakturaer lagres i henhold til norske regnskapsregler (7 år / 2555 dager).</li>
      </ul>

      <h2>3. Formål og rettslig grunnlag</h2>
      <ul>
        <li>Levere EHF-fakturaservice etter Peppol/EHF-standarden (avtale, jf. GDPR art. 6(1)(b)).</li>
        <li>Oppfylle norsk bokføringslov § 13 – oppbevaringskrav 5 år (avtale/lovpålagt forpliktelse).</li>
        <li>Fakturanummerering og kontroll (berettiget interesse, jf. GDPR art. 6(1)(f)).</li>
      </ul>

      <h2>4. Dataoverføring og tredjepart</h2>
      <ul>
        <li><strong>Peppol Access Point:</strong> EHF-XML overføres via et norsk/europeisk Access Point til mottakers regnskapssystem.</li>
        <li><strong>Fiken (valgfritt):</strong> Dersom aktivert, synkroniseres fakturadata til Fiken AS&apos; API.</li>
        <li><strong>E-post (SMTP):</strong> Faktura-PDF sendes til oppgitt e-postadresse via SMTP-leverandør.</li>
        <li>Ingen data selges eller deles med tredjeparter for markedsføringsformål.</li>
      </ul>

      <h2>5. Dataoppbevaring og sletting</h2>
      <ul>
        <li>Fakturaer: 7 år (2555 dager) fra fakturadato – lovpålagt.</li>
        <li>Webhook- og auditlogger: 90/180 dager.</li>
        <li>Ved avinstallasjon av appen: Alle butikk- og kundedata slettes automatisk innen 48 timer, med unntak av fakturaer som oppbevares i henhold til bokføringsloven.</li>
      </ul>

      <h2>6. Dine rettigheter</h2>
      <p>
        Du har rett til innsyn, retting, sletting (der loven tillater det), dataportabilitet og
        innsigelse. Send forespørsel til{" "}
        <a href="mailto:personvern@nokto.no">personvern@nokto.no</a>.
      </p>
      <p>
        Du kan også klage til <a href="https://www.datatilsynet.no" target="_blank" rel="noreferrer">Datatilsynet</a>.
      </p>

      <h2>7. Sikkerhet</h2>
      <p>
        Tilgangstokener krypteres med AES-256-GCM. All kommunikasjon er TLS-kryptert.
        Databasetilgang er begrenset til applikasjonsserveren.
      </p>

      <h2>8. Endringer</h2>
      <p>
        Vi kan oppdatere denne policyen. Vesentlige endringer varsles via e-post eller i
        Shopify Admin.
      </p>

      <hr />
      <p>
        <strong>Nokto AS</strong> · <a href="mailto:personvern@nokto.no">personvern@nokto.no</a>
      </p>
    </main>
  );
}
