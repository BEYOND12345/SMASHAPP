import React from 'react';
import { Mic } from 'lucide-react';

interface FABProps {
  onClick: () => void;
}

export const FAB: React.FC<FABProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="w-[64px] h-[64px] rounded-full bg-brand text-white shadow-float flex items-center justify-center hover:bg-brandHover hover:scale-105 active:scale-95 transition-all duration-300"
    >
      <Mic size={30} strokeWidth={2.5} className="text-accent" />
    </button>
  );
};