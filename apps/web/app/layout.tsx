import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'YouStudio — estúdio de vídeos para YouTube',
  description: 'Do tema ao vídeo pronto para o YouTube, etapa por etapa.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable}`}>
      <body className="min-h-screen pt-16 font-sans">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
