import type { Metadata, Viewport } from 'next';
import './globals.css';
import './amorri-premium.css';
import './amorri-premium-v2.css';
import './amorri-design-system.css';
import './amorri-motion-system.css';
import './amorri-brand-elevation.css';
import './amorri-contrast-motion-r83.css';
import {AmorriMicroInteractions} from '@/components/AmorriMicroInteractions';

export const metadata: Metadata = {
  title: 'Amorri Studio — Studio OS 3.2.5',
  description: 'Điều hành lịch quay chụp, đội ngũ, sản phẩm và hoạt động studio.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><AmorriMicroInteractions/>{children}</body></html>;
}
