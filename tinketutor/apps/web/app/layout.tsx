import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import './globals.css';
import { AuthProvider } from '../lib/hooks';
import { I18nProvider } from '../lib/i18n';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'TinkeTutor — Aktivt Laeringsrum',
  description:
    'Gor dit studiemateriale til et aktivt laeringsrum med videnkort, sokratisk tutoring og quizzer forankret i dine egne kilder.',
  keywords: [
    'education',
    'active learning',
    'knowledge map',
    'study tools',
    'exam preparation',
    'AI tutor',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="da" className={`${inter.variable} ${jetBrainsMono.variable}`}>
      <body>
        <I18nProvider>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
