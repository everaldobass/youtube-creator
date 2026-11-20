import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { SiteHeader } from '@/components/site-header';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'YouStudio — estúdio de vídeos para YouTube',
  description: 'Do tema ao vídeo pronto para o YouTube, etapa por etapa.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable}`}>
      <body className="min-h-screen font-sans">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
        >
          Pular para o conteúdo
        </a>
        <SiteHeader />
        <div className="pt-16">{children}</div>
        <Toaster />
      </body>
    </html>
  );
}
