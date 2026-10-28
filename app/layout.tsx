import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OpenMind Chat',
  description: 'Original AI chat app inspired by modern chat interfaces.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
