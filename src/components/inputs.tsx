import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ label, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-2 w-full">
      {label && <label className="text-[13px] font-bold text-slate-400 ml-1 uppercase tracking-widest">{label}</label>}
      <input 
        className={`h-14 px-4 rounded-xl border-2 border-slate-100 bg-white text-slate-900 text-[15px] font-semibold placeholder:text-slate-300 focus:outline-none focus:border-slate-900 transition-all duration-300 ${className}`}
        {...props}
      />
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: string[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className = '', value, ...props }) => {
  return (
    <div className="flex flex-col gap-2 w-full">
      {label && <label className="text-[13px] font-bold text-slate-400 ml-1 uppercase tracking-widest">{label}</label>}
      <div className="relative">
        <select
          className={`h-14 w-full px-4 rounded-xl border-2 border-slate-100 bg-white text-slate-900 text-[15px] font-semibold appearance-none focus:outline-none focus:border-slate-900 transition-all duration-300 ${className}`}
          value={value}
          {...props}
        >
          {value === '' && <option value="" disabled>Select...</option>}
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
};
