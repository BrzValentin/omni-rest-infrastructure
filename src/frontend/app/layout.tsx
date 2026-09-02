import type { Metadata } from "next";
import type { ReactNode } from "react";

import { WebVitalsReporter } from "@/components/vitals/WebVitalsReporter";
import { message } from "@/lib/menu-messages";
import { readTenantDocument } from "@/lib/tenant-document";

import "./globals.css";

/**
 * The default title for any document that does not set its own. It must never name the platform: on a
 * multi-tenant site that is a brand belonging to no restaurant served on this host. Public pages
 * supply the resolved restaurant's name here, and the owner portal supplies its own.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { name } = await readTenantDocument();
  return {
    title: name ?? message("unnamedRestaurant"),
    description: "Public restaurant information and digital menu.",
  };
}

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function RootLayout({ children }: RootLayoutProps) {
  const { lang } = await readTenantDocument();
  return (
    <html lang={lang}>
      {/*
        The reporter renders nothing and registers its observers after hydration, so it is a client
        island inside a server layout rather than a reason to make the layout a client component.
      */}
      <body>{children}<WebVitalsReporter /></body>
    </html>
  );
}
