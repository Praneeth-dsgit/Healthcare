import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SegmentTabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface SegmentTabsProps {
  tabs: SegmentTabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

const SegmentTabs: React.FC<SegmentTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div
      className={`segment-tabs hide-scrollbar overflow-x-auto ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`segment-tab ${isActive ? 'segment-tab-active' : ''}`}
          >
            {Icon && <Icon size={16} className="shrink-0" />}
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default SegmentTabs;
