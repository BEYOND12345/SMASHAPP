import React from 'react';
import { Plus } from 'lucide-react';

interface FABProps {
  onClick: () => void;
}

export const FAB: React.FC<FABProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="w-[64px] h-[64px] rounded-full bg-brand text-white shadow-float flex items-center justify-center hover:bg-brandHover hover:scale-105 active:scale-95 transition-all duration-300"
    >
      <Plus size={32} strokeWidth={2.5} />
    </button>
  );
};