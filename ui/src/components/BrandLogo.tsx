import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 32, className }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="64" height="64" rx="16" fill="#070709" />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="14.5"
        stroke="#ff1e38"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
      <circle
        cx="32"
        cy="32"
        r="22"
        stroke="#ff1e38"
        strokeOpacity="0.2"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <path
        d="M8 33H19L24.5 19L31.5 46L37.5 25L42 33H56"
        stroke="#ff1e38"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="51" cy="33" r="3.5" fill="#ff4757" />
    </svg>
  );
};
