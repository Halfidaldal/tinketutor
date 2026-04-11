import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import './globals.css';
import { AuthProvider } from '../lib/hooks';

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
  title: 'Synthesis Studio — Active Learning Workspace',
  description:
    'Transform your study materials into an interactive exam-prep workspace with concept maps, Socratic tutoring, and AI-powered quizzes — all grounded in your own sources.',
  keywords: [
    'education',
    'active learning',
    'concept map',
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
