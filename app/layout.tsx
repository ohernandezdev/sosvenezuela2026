import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from 'next/font/google';
import { SseProvider } from './sse-provider';
import Track from './track';
import type { ReactNode } from 'react';

// Self-hosted fonts: Next downloads & subsets them at build time and serves
// them same-origin. This removes the render-blocking request to
// fonts.googleapis.com plus the extra DNS/TLS handshakes to gstatic — a real
// win on the slow, high-latency networks this site targets. `display: swap`
// paints text immediately with a fallback while the webfont streams in.
const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-bricolage',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
});
const fontBody = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-jakarta',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
});

const SITE = 'https://sosvenezuela2026.com';
const DESC = 'Mapa colaborativo en tiempo real del terremoto M7.5 en Venezuela (24 jun 2026): reportes de daños y colapsos, búsqueda de personas desaparecidas, refugios, primeros auxilios y canal comunitario. Tu ubicación exacta nunca se comparte públicamente.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'SOS Venezuela 2026 — Mapa en vivo del terremoto',
    template: '%s · SOS Venezuela 2026',
  },
  description: DESC,
  applicationName: 'SOS Venezuela 2026',
  authors: [{ name: 'SOS Venezuela 2026' }],
  generator: 'Next.js',
  keywords: [
    'terremoto Venezuela', 'sismo Venezuela 2026', 'terremoto 24 junio 2026', 'terremoto Caracas',
    'terremoto Morón', 'Puerto Cabello sismo', 'La Guaira terremoto', 'mapa terremoto en vivo',
    'personas desaparecidas Venezuela', 'refugios Venezuela', 'primeros auxilios sismo',
    'edificios colapsados', 'SOS Venezuela', 'ayuda terremoto Venezuela', 'réplicas Venezuela',
  ],
  category: 'news',
  alternates: { canonical: '/' },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  openGraph: {
    type: 'website', locale: 'es_VE', url: SITE, siteName: 'SOS Venezuela 2026',
    title: 'SOS Venezuela 2026 — Mapa en vivo del terremoto',
    description: DESC,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SOS Venezuela 2026 — Mapa en vivo del terremoto',
    description: DESC,
  },
  appleWebApp: { capable: true, title: 'SOS Venezuela 2026', statusBarStyle: 'default' },
  formatDetection: { telephone: true },
  other: { 'llms-txt': `${SITE}/llms.txt` },
};

// Structured data for search engines + LLMs.
const JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite', '@id': `${SITE}/#website`, url: SITE, name: 'SOS Venezuela 2026',
      description: DESC, inLanguage: 'es-VE',
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/buscar?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
    },
    {
      '@type': 'Organization', '@id': `${SITE}/#org`, name: 'SOS Venezuela 2026', url: SITE,
      logo: `${SITE}/icon.svg`, description: 'Plataforma cívica humanitaria de respuesta al terremoto de Venezuela 2026.',
    },
    {
      '@type': 'SpecialAnnouncement', name: 'Terremoto M7.5 — Venezuela, 24 de junio de 2026',
      text: DESC, datePosted: '2026-06-24', category: 'https://www.wikidata.org/wiki/Q7944',
      url: SITE, announcementLocation: { '@type': 'Country', name: 'Venezuela' },
      spatialCoverage: { '@type': 'Country', name: 'Venezuela' },
    },
  ],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0D9488',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${fontDisplay.variable} ${fontBody.variable}`}>
      <head>
        {/* Warm up the DNS for the map tile CDN so tiles start downloading
            sooner once the (lazily-loaded) map mounts. dns-prefetch is cheap
            and doesn't tie up a connection slot like preconnect would. */}
        <link rel="dns-prefetch" href="https://basemaps.cartocdn.com" />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }} />
        <SseProvider>{children}</SseProvider>
        <Track />
      </body>
    </html>
  );
}
