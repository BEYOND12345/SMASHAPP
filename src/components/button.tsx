import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'accent' | 'success';
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
  const baseStyles = 'h-[56px] px-6 rounded-2xl font-bold text-[15px] tracking-tight transition-all duration-200 flex items-center justify-center active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

  const variants = {
    primary: 'bg-brand text-white hover:bg-brandDark shadow-md hover:shadow-lg',
    secondary: 'bg-surface text-primary border border-border hover:bg-gray-100',
    outline: 'bg-white text-primary border-2 border-border hover:border-gray-300 hover:bg-gray-50',
    accent: 'bg-accent text-accentText hover:bg-accentDark shadow-md hover:shadow-lg',
    success: 'bg-accent text-accentText hover:bg-accentDark shadow-md shadow-accent/20 hover:shadow-lg'
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
