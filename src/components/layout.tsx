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
    <div className="min-h-screen w-full flex justify-center bg-[#f1f5f9] font-sans text-primary">
      <div className="w-full max-w-[390px] h-[100dvh] bg-[#FAFAFA] flex flex-col shadow-2xl relative isolate">
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col">
          <main className={`flex-1 ${className}`}>
            {children}
          </main>
        </div>

        {fab && (
          <div className="absolute bottom-[112px] right-6 z-40">
            {fab}
          </div>
        )}

        {showNav && (
          <nav className="h-[96px] bg-white border-t border-gray-50 flex items-start pt-5 justify-center gap-12 shrink-0 z-50 absolute bottom-0 w-full left-0 rounded-t-[32px] shadow-[0_-5px_20px_rgba(0,0,0,0.02)]">
            <button
              onClick={() => onTabChange?.('estimates')}
              className={`group flex flex-col items-center gap-1.5 w-16 transition-all duration-300 ${activeTab === 'estimates' ? 'text-primary' : 'text-tertiary hover:text-secondary'}`}
            >
              <div className={`transition-transform duration-300 ${activeTab === 'estimates' ? '-translate-y-1' : ''}`}>
                <Home size={26} strokeWidth={activeTab === 'estimates' ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-bold tracking-wide transition-colors ${activeTab === 'estimates' ? 'text-primary' : 'text-tertiary'}`}>Estimates</span>
            </button>
            <button
              onClick={() => onTabChange?.('invoices')}
              className={`group flex flex-col items-center gap-1.5 w-16 transition-all duration-300 ${activeTab === 'invoices' ? 'text-primary' : 'text-tertiary hover:text-secondary'}`}
            >
               <div className={`transition-transform duration-300 ${activeTab === 'invoices' ? '-translate-y-1' : ''}`}>
                <FileText size={26} strokeWidth={activeTab === 'invoices' ? 2.5 : 2} />
               </div>
              <span className={`text-[10px] font-bold tracking-wide transition-colors ${activeTab === 'invoices' ? 'text-primary' : 'text-tertiary'}`}>Invoices</span>
            </button>
            <button
              onClick={() => onTabChange?.('customers')}
              className={`group flex flex-col items-center gap-1.5 w-16 transition-all duration-300 ${activeTab === 'customers' ? 'text-primary' : 'text-tertiary hover:text-secondary'}`}
            >
               <div className={`transition-transform duration-300 ${activeTab === 'customers' ? '-translate-y-1' : ''}`}>
                <Users size={26} strokeWidth={activeTab === 'customers' ? 2.5 : 2} />
               </div>
              <span className={`text-[10px] font-bold tracking-wide transition-colors ${activeTab === 'customers' ? 'text-primary' : 'text-tertiary'}`}>Customers</span>
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
    <header className={`h-[70px] flex items-center justify-between px-6 shrink-0 z-20 transition-colors duration-200
      ${transparent ? 'bg-transparent' : 'bg-[#FAFAFA]/90 backdrop-blur-lg sticky top-0'}
    `}>
      <div className="w-10 flex justify-start">{left}</div>
      <div className="flex-1 text-center">
        {title && <h1 className={`text-[17px] font-bold tracking-tight ${variant === 'dark' ? 'text-white' : 'text-primary'}`}>{title}</h1>}
      </div>
      <div className="w-10 flex justify-end">{right}</div>
    </header>
  );
};

export const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`flex flex-col gap-4 mb-8 px-6 ${className}`}>
    <h2 className="text-[12px] font-bold text-secondary uppercase tracking-widest ml-1 opacity-80">{title}</h2>
    {children}
  </div>
);