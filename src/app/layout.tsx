import "./globals.css";
import { Suspense } from "react";
import { Cinzel, Spectral, IBM_Plex_Mono } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TopProgress from "@/components/TopProgress";
import SWRProvider from "@/components/SWRProvider";

const display = Cinzel({ subsets: ["latin"], weight: ["500", "700", "900"], variable: "--font-display" });
const body = Spectral({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-mono" });

export const metadata = { title: "The Omen Archive", description: "Universes Beyond reskin database" };

const themeInit = `(function(){try{var t=localStorage.getItem('theme');var root=document.documentElement;if(t==='light'){root.classList.remove('dark');}else{root.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body className="min-h-screen">
        <SWRProvider>
          <Suspense fallback={null}><TopProgress /></Suspense>
          <Header />
          <div className="mx-auto max-w-6xl px-4">{children}</div>
          <Footer />
        </SWRProvider>
      </body>
    </html>
  );
}
