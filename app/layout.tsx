import type { Metadata } from 'next';
import './globals.css';
import { PhoneHeader } from '@/components/PhoneHeader';
import { DevToolbar } from '@/components/DevToolbar';
import { ViewModeProvider } from '@/components/ViewModeContext';

export const metadata: Metadata = {
  title: 'Astrix - Smart Umbrella System (UoM)',
  description: 'IoT Smart Umbrella Borrowing System - University of Moratuwa',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-800 antialiased flex flex-col items-center justify-center min-h-screen sm:p-6 selection:bg-sky-500 selection:text-white">
        <ViewModeProvider>
          {/* View Mode Controller */}
          <DevToolbar />

          {/* Desktop Smartphone Container Frame */}
          <div className="w-full max-w-md min-h-screen sm:min-h-[844px] sm:max-h-[880px] bg-white sm:rounded-[44px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] flex flex-col relative overflow-hidden sm:border-[8px] sm:border-slate-900">
            {/* Simulated Mobile Status Bar */}
            <PhoneHeader />

            {/* Screen Content Viewport */}
            <div className="flex-1 flex flex-col overflow-y-auto relative bg-slate-50">
              {children}
            </div>
          </div>
        </ViewModeProvider>
      </body>
    </html>
  );
}
