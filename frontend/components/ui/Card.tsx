'use client'

import { motion } from 'framer-motion';
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', hover = false }) => (
  <motion.div
    // Padding is deliberately smaller than the shell's own gutter on phones:
    // a card sits inside `main`'s padding, so `p-6` here meant a 360px screen
    // spent 64px of its width on nothing before any content rendered.
    // break-inside-avoid only matters for paged media (print/PDF) — it's a
    // no-op on screen, so it's safe as an unconditional default rather than
    // something every print-aware page has to opt into per card.
    className={`bg-white rounded-card border border-[#EAEAEA] shadow-card p-4 sm:p-5 lg:p-6 break-inside-avoid ${hover ? 'hover:shadow-card-hover hover:border-[#E5E5E5] transition-all duration-200' : ''} ${className}`}
    whileHover={hover ? { y: -2 } : {}}
    transition={{ duration: 0.2 }}
  >
    {children}
  </motion.div>
);