import type { Metadata, Viewport } from 'next';

// Inter, npm paketinden yerel olarak servis edilir; Google Fonts'a istek atılmaz.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'RASTLA — Su sporları ve yerel aktivite pazaryeri',
    template: '%s | RASTLA',
  },
  description:
    'RASTLA; su sporlarını ve yerel turistik aktiviteleri şeffaf fiyat, doğrulanmış işletme ve hızlı rezervasyon deneyimiyle bir araya getirir.',
  icons: {
    icon: '/brand/rastla-app-icon.png',
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
