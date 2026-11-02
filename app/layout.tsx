import type { Metadata, Viewport } from 'next';
import './globals.css';
import './amorri-premium.css';
import './amorri-premium-v2.css';

export const metadata: Metadata = {
  title: 'Amorri Studio — VNext 2.5',
  description: 'Điều hành lịch quay chụp, đội ngũ, sản phẩm và hoạt động studio.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
