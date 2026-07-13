import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import type { BandwidthQuality } from '../../services/telemedicineService';

const LABELS: Record<BandwidthQuality, { text: string; className: string }> = {
  good: { text: 'Good connection', className: 'text-emerald-300 bg-emerald-500/15' },
  fair: { text: 'Fair — adapting quality', className: 'text-amber-300 bg-amber-500/15' },
  low: { text: 'Low bandwidth', className: 'text-red-300 bg-red-500/15' },
};

const BandwidthIndicator: React.FC<{ quality: BandwidthQuality }> = ({ quality }) => {
  const { text, className } = LABELS[quality];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {quality === 'low' ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
      {text}
    </span>
  );
};

export default BandwidthIndicator;
