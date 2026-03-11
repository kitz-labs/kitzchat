'use client';

import { useState } from 'react';

type BrandLogoProps = {
  compact?: boolean;
  subtitle?: string;
  className?: string;
  imageClassName?: string;
};

export function BrandLogo({ compact = false, subtitle, className = '', imageClassName = '' }: BrandLogoProps) {
  const [src, setSrc] = useState('/kitzchat.png');
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = compact ? 'h-9' : 'h-12';

  function handleError() {
    if (src !== '/kitzchat.svg') {
      setSrc('/kitzchat.svg');
      return;
    }
    setImageFailed(true);
  }

  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`.trim()}>
      {!imageFailed ? (
        <img
          src={src}
          alt="KitzChat"
          className={`${sizeClass} ${imageClassName} w-auto object-contain shrink-0`.trim()}
          onError={handleError}
        />
      ) : (
        <div className={`${compact ? 'h-9 px-3 text-lg' : 'h-12 px-4 text-2xl'} rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black tracking-tight shrink-0`}>
          KitzChat
        </div>
      )}

      {!compact ? (
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-none">KitzChat</div>
          {subtitle ? <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">{subtitle}</div> : null}
        </div>
      ) : null}
    </div>
  );
}