// app/routes/auth.fiken.callback.tsx
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { encrypt } from "~/lib/crypto.server";
import { logger } from "~/lib/logger.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return redirect("/app");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    logger.warn({ shop: session.shop, error }, "Fiken OAuth error");
    return redirect("/app/settings?fikenError=1");
  }

  const clientId = process.env.FIKEN_CLIENT_ID;
  const clientSecret = process.env.FIKEN_CLIENT_SECRET;
  const redirectUri = process.env.FIKEN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return redirect("/app/settings?fikenError=config");
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://fiken.no/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    logger.error({ shop: session.shop }, "Fiken token exchange failed");
    return redirect("/app/settings?fikenError=token");
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Get Fiken company list
  const companyRes = await fetch("https://api.fiken.no/api/v2/companies", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  const companies = (await companyRes.json()) as Array<{ slug: string; name: string }>;
  const companySlug = companies[0]?.slug ?? "";

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await db.fikenIntegration.upsert({
    where: { shopId: shop.id },
    update: {
      accessToken: await encrypt(tokens.access_token),
      refreshToken: await encrypt(tokens.refresh_token),
      tokenExpiresAt: expiresAt,
      companySlug,
      isActive: true,
    },
    create: {
      shopId: shop.id,
      accessToken: await encrypt(tokens.access_token),
      refreshToken: await encrypt(tokens.refresh_token),
      tokenExpiresAt: expiresAt,
      companySlug,
      isActive: true,
    },
  });

  logger.info({ shop: session.shop, companySlug }, "Fiken integration connected");
  return redirect("/app/settings?fikenConnected=1");
}
