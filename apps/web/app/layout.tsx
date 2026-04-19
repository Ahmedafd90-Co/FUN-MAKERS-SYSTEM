import { Source_Sans_3, Geist_Mono } from 'next/font/google';
import { brandCssVars, activeTheme } from '@fmksa/brand';

import { TRPCProvider } from '@/providers/trpc-provider';

import type { Metadata } from 'next';

import './globals.css';

/**
 * Source Sans 3 — product-wide sans-serif, per brand guidelines.
 * Weights map to the type scale defined in `@fmksa/brand/themes/pico-play`:
 *   300 display / KPI · 400 body · 500 chrome · 600 emphasis
 */
const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

/**
 * Geist Mono — IDs, document numbers, amounts in compliance surfaces
 * (audit log, override log, evidence drawer). Loaded but not applied by
 * default; components opt in with `font-mono`.
 */
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: activeTheme.copy.productName,
  description: activeTheme.copy.platformDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${geistMono.variable}`}
    >
      <head>
        {/*
          Brand CSS variables — rendered from the active theme at build
          time. Injected here (not in globals.css) so tenant swaps do not
          require editing a CSS file.
        */}
        <style dangerouslySetInnerHTML={{ __html: brandCssVars }} />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
