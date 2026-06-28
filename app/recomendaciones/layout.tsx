import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Primeros auxilios tras un terremoto',
  description: '13 guías rápidas de primeros auxilios para terremotos basadas en Cruz Roja, OMS y FEMA: qué hacer durante el sismo, hemorragias, RCP, personas atrapadas, síndrome de aplastamiento, cómo mantenerte conectado (Starlink) y más.',
  keywords: ['primeros auxilios terremoto', 'qué hacer durante un sismo', 'RCP', 'personas atrapadas', 'síndrome de aplastamiento', 'guía emergencia Venezuela', 'Starlink Venezuela', 'comunicación emergencia sin señal'],
  alternates: { canonical: '/recomendaciones' },
  openGraph: { title: 'Primeros auxilios tras un terremoto · SOS Venezuela 2026', description: '13 guías basadas en Cruz Roja, OMS y FEMA.', url: 'https://sosvenezuela2026.com/recomendaciones' },
};

export default function Layout({ children }: { children: ReactNode }) { return children; }
