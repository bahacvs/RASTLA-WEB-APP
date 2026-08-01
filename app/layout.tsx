import type { Metadata, Viewport } from 'next';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';

// Inter, npm paketinden yerel olarak servis edilir; Google Fonts'a istek atılmaz.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'RASTLA — Su sporları ve yerel aktivite pazaryeri',
    template: '%s | RASTLA',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'su sporları',
    'jet ski kiralama',
    'SUP kiralama',
    'kano kiralama',
    'tekne turu',
    'Büyükçekmece',
    'İstanbul',
  ],
  icons: {
    icon: '/brand/rastla-app-icon.png',
    apple: '/brand/rastla-app-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: SITE_NAME,
    title: 'RASTLA — Su sporları ve yerel aktivite pazaryeri',
    description: SITE_DESCRIPTION,
    images: [{ url: '/images/jetski-hero.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export const viewport: Viewport = {
  themeColor: '#0754b8',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      {/*
        Alt navigasyon bilinçli olarak burada değil: prototipte yalnızca ana
        sayfa ve arama ekranında var. Detay ve rezervasyon ekranlarında onun
        yerine yapışkan rezervasyon çubuğu bulunur, ikisi üst üste binmemeli.
      */}
      <body className="bg-background text-body-md text-on-background">{children}</body>
    </html>
  );
}
