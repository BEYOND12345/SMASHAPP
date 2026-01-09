import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'accent' | 'success' | 'danger';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...props
}) => {
  const baseStyles = 'h-[54px] px-6 rounded-[16px] font-bold text-[15px] tracking-tight transition-all duration-200 flex items-center justify-center active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100';

  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-md active:shadow-sm',
    secondary: 'bg-white text-slate-900 border border-slate-100 hover:bg-slate-50 active:bg-slate-100',
    outline: 'bg-transparent text-slate-900 border-2 border-slate-100 hover:border-slate-200 active:bg-slate-50',
    accent: 'bg-accent text-accentText shadow-md shadow-accent/10 active:shadow-sm',
    success: 'bg-accent text-accentText shadow-md shadow-accent/10 active:shadow-sm',
    danger: 'bg-red-500 text-white shadow-md active:shadow-sm'
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${widthClass} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
