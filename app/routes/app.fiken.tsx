// app/routes/app.fiken.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Button, Text, BlockStack, Badge, Banner } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Not found", { status: 404 });

  const fiken = await db.fikenIntegration.findUnique({
    where: { shopId: shop.id },
    select: { isActive: true, companySlug: true, lastSyncAt: true, createdAt: true },
  });

  const clientId = process.env.FIKEN_CLIENT_ID;
  const redirectUri = process.env.FIKEN_REDIRECT_URI;

  const authUrl =
    clientId && redirectUri
      ? `https://fiken.no/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=nokto`
      : null;

  const url = new URL(request.url);
  const connected = url.searchParams.get("fikenConnected") === "1";
  const error = url.searchParams.get("fikenError");

  return json({ fiken, authUrl, connected, error });
}

export default function FikenPage() {
  const { fiken, authUrl, connected, error } = useLoaderData<typeof loader>();

  return (
    <Page title="Fiken-integrasjon" backAction={{ content: "Innstillinger", url: "/app/settings" }}>
      <Layout>
        {connected && (
          <Layout.Section>
            <Banner tone="success" title="Fiken koblet til!">
              Du kan nå synkronisere kunder og fakturaer til Fiken automatisk.
            </Banner>
          </Layout.Section>
        )}
        {error && (
          <Layout.Section>
            <Banner tone="critical" title="Feil ved kobling til Fiken">
              Feil: {error}. Prøv igjen eller sjekk Fiken-konfigurasjonen.
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Status</Text>

              {fiken?.isActive ? (
                <BlockStack gap="200">
                  <Badge tone="success">Tilkoblet</Badge>
                  <Text as="p">Firma: {fiken.companySlug}</Text>
                  {fiken.lastSyncAt && (
                    <Text as="p" tone="subdued">
                      Sist synkronisert: {new Date(fiken.lastSyncAt).toLocaleString("nb-NO")}
                    </Text>
                  )}
                </BlockStack>
              ) : (
                <BlockStack gap="200">
                  <Badge tone="attention">Ikke koblet til</Badge>
                  <Text as="p" tone="subdued">
                    Koble til Fiken for å synkronisere kunder og fakturaer automatisk.
                  </Text>
                  {authUrl ? (
                    <Button url={authUrl} variant="primary">
                      Koble til Fiken
                    </Button>
                  ) : (
                    <Banner tone="warning">
                      Fiken OAuth er ikke konfigurert. Sett FIKEN_CLIENT_ID og FIKEN_REDIRECT_URI i
                      miljøvariabler.
                    </Banner>
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Hva synkroniseres?</Text>
              <Text as="p">• B2B-kunder → Fiken kontakter</Text>
              <Text as="p">• Fakturaer → Fiken utgående fakturaer</Text>
              <Text as="p">• Betalingsstatus → Fiken betalinger</Text>
              <Text as="p" tone="subdued">
                Synkronisering skjer automatisk via jobkø etter faktura-utsendelse.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
