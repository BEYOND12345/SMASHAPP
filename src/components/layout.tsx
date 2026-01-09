import React from 'react';
import { Home, FileText, Users } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
  activeTab?: 'estimates' | 'invoices' | 'customers';
  onTabChange?: (tab: 'estimates' | 'invoices' | 'customers') => void;
  className?: string;
  fab?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  showNav = true,
  activeTab = 'estimates',
  onTabChange,
  className = '',
  fab
}) => {
  return (
    <div className="min-h-screen w-full flex justify-center bg-slate-100 font-sans text-slate-900 antialiased">
      <div className="w-full max-w-[390px] h-[100dvh] bg-[#FAFAFA] flex flex-col shadow-2xl relative isolate overflow-hidden">
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col">
          <main className={`flex-1 ${className}`}>
            {children}
          </main>
        </div>

        {fab && (
          <div className="absolute bottom-[100px] right-5 z-40 animate-in fade-in zoom-in duration-500">
            {fab}
          </div>
        )}

        {showNav && (
          <nav className="h-[88px] bg-white/95 backdrop-blur-xl border-t border-slate-100 flex items-start pt-4 justify-center gap-10 shrink-0 z-50 absolute bottom-0 w-full left-0 rounded-t-[28px] shadow-[0_-5px_25px_rgba(0,0,0,0.02)]">
            <button
              onClick={() => onTabChange?.('estimates')}
              className={`group flex flex-col items-center gap-1.5 w-16 transition-all duration-300 ${activeTab === 'estimates' ? 'text-slate-900' : 'text-slate-300 hover:text-slate-500'}`}
            >
              <div className={`transition-transform duration-300 ${activeTab === 'estimates' ? '-translate-y-0.5' : ''}`}>
                <Home size={24} strokeWidth={activeTab === 'estimates' ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'estimates' ? 'text-slate-900' : 'text-slate-300'}`}>Estimates</span>
            </button>
            <button
              onClick={() => onTabChange?.('invoices')}
              className={`group flex flex-col items-center gap-1.5 w-16 transition-all duration-300 ${activeTab === 'invoices' ? 'text-slate-900' : 'text-slate-300 hover:text-slate-500'}`}
            >
               <div className={`transition-transform duration-300 ${activeTab === 'invoices' ? '-translate-y-0.5' : ''}`}>
                <FileText size={24} strokeWidth={activeTab === 'invoices' ? 2.5 : 2} />
               </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'invoices' ? 'text-slate-900' : 'text-slate-300'}`}>Invoices</span>
            </button>
            <button
              onClick={() => onTabChange?.('customers')}
              className={`group flex flex-col items-center gap-1.5 w-16 transition-all duration-300 ${activeTab === 'customers' ? 'text-slate-900' : 'text-slate-300 hover:text-slate-500'}`}
            >
               <div className={`transition-transform duration-300 ${activeTab === 'customers' ? '-translate-y-0.5' : ''}`}>
                <Users size={24} strokeWidth={activeTab === 'customers' ? 2.5 : 2} />
               </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'customers' ? 'text-slate-900' : 'text-slate-300'}`}>Customers</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
};

export const Header: React.FC<{ 
  title?: string; 
  left?: React.ReactNode; 
  right?: React.ReactNode;
  transparent?: boolean;
  variant?: 'light' | 'dark';
}> = ({ title, left, right, transparent, variant = 'light' }) => {
  return (
    <header className={`h-[64px] flex items-center justify-between px-5 shrink-0 z-20 transition-all duration-300
      ${transparent ? 'bg-transparent' : 'bg-[#FAFAFA]/80 backdrop-blur-md sticky top-0'}
    `}>
      <div className="w-10 flex justify-start">{left}</div>
      <div className="flex-1 text-center">
        {title && <h1 className={`text-[17px] font-bold tracking-tight ${variant === 'dark' ? 'text-white' : 'text-slate-900'}`}>{title}</h1>}
      </div>
      <div className="w-10 flex justify-end">{right}</div>
    </header>
  );
};

export const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`flex flex-col gap-3 mb-8 px-5 ${className}`}>
    <h2 className="text-[12px] font-bold text-slate-400 uppercase tracking-widest ml-1">{title}</h2>
    {children}
  </div>
);
