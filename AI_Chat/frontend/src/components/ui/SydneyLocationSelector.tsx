import React from 'react';
import { MapPin } from 'lucide-react';
import { SYDNEY_LOCATIONS } from '../../demo/fixtures/doctorsGeo';
import { useLocationContext } from '../../context/LocationContext';
import { portalInputClass } from '../patient/portalPageLayout';

interface SydneyLocationSelectorProps {
  compact?: boolean;
  className?: string;
  showLabel?: boolean;
}

const SydneyLocationSelector: React.FC<SydneyLocationSelectorProps> = ({
  compact = false,
  className = '',
  showLabel = true,
}) => {
  const { locationId, setLocationId } = useLocationContext();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && !compact && (
        <span className="hidden text-xs font-semibold text-slate-400 sm:inline">Location</span>
      )}
      <div className="relative min-w-0">
        <MapPin
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-teal-400 ${
            compact ? 'left-2 h-3.5 w-3.5' : 'left-2.5 h-4 w-4'
          }`}
        />
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className={`${portalInputClass} max-w-[11rem] truncate font-medium sm:max-w-[13rem] ${
            compact ? 'py-1.5 pl-7 pr-6 text-xs' : 'py-2 pl-8 pr-7 text-sm'
          }`}
          aria-label="Sydney location"
          title="Select your Sydney area"
        >
          {SYDNEY_LOCATIONS.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default SydneyLocationSelector;
