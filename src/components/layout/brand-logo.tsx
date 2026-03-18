'use client';

import { useState } from 'react';

type BrandLogoProps = {
  compact?: boolean;
  subtitle?: string;
  className?: string;
  imageClassName?: string;
};

export function BrandLogo({ compact = false, subtitle, className = '', imageClassName = '' }: BrandLogoProps) {
  const [src, setSrc] = useState('/brand/logo.png');
  const [imageFailed, setImageFailed] = useState(false);
  // ~30% bigger across the app
  const sizeClass = compact ? 'h-12' : 'h-16';

  function handleError() {
    if (src !== '/kitzchat.png') {
      setSrc('/kitzchat.png');
      return;
    }
    setImageFailed(true);
  }

  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`.trim()}>
      {!imageFailed ? (
        <img
          src={src}
          alt="Nexora"
          className={`${sizeClass} ${imageClassName} w-auto object-contain shrink-0`.trim()}
          onError={handleError}
        />
      ) : (
        <div
          aria-label="Nexora"
          className={`${compact ? 'h-12 w-12' : 'h-16 w-16'} rounded-2xl bg-gradient-to-br from-cyan-400/70 to-violet-500/70 border border-white/10 shadow-2xl shrink-0`}
        />
      )}

      {!compact && subtitle ? (
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">{subtitle}</div>
        </div>
      ) : null}
    </div>
  );
}
