import React, { useState } from 'react';
import {
  LayoutDashboard,
  Calendar,
  CalendarPlus,
  BrainCircuit,
  UserPlus,
  CreditCard,
  ListOrdered,
  FileText,
  LogOut,
  AlertCircle,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import StaffPortalShell from './ui/StaffPortalShell';
import SydneyLocationSelector from './ui/SydneyLocationSelector';
import FrontDeskDashboard from './FrontDeskDashboard';
import PatientEngagement from './PatientEngagement';
import FrontDeskEngagementConsole from './FrontDeskEngagementConsole';
import EngagementAnalytics from './EngagementAnalytics';

type FrontDeskSection =
  | 'dashboard'
  | 'appointments'
  | 'book'
  | 'query'
  | 'registration'
  | 'billing'
  | 'queue'
  | 'reports'
  | 'engagement'
  | 'analytics';

interface FrontDeskPortalProps {
  sessionId?: string | null;
  onLogout?: () => void;
}

const NAV_ITEMS: { id: FrontDeskSection; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'book', label: 'Book Appointment', icon: CalendarPlus },
  { id: 'query', label: 'Query Results', icon: BrainCircuit },
  { id: 'engagement', label: 'Engagement Console', icon: Sparkles },
  { id: 'analytics', label: 'Engagement Analytics', icon: BarChart3 },
  { id: 'registration', label: 'Registration', icon: UserPlus },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'reports', label: 'Reports', icon: FileText },
];

const FrontDeskPortal: React.FC<FrontDeskPortalProps> = ({ sessionId, onLogout }) => {
  const [activeSection, setActiveSection] = useState<FrontDeskSection>('dashboard');

  const sidebar = (
    <nav className="space-y-1.5">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveSection(item.id)}
            className={`sidebar-link flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold ${
              isActive ? 'sidebar-link-active' : ''
            }`}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="sidebar-link mt-4 flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-red-400 hover:bg-red-500/15"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      )}
    </nav>
  );

  const renderContent = () => {
    if (activeSection === 'appointments') {
      return (
        <div className="frontdesk-embed h-full min-h-0">
          <PatientEngagement sessionId={sessionId} forcedTab="appointments" hideTabs />
        </div>
      );
    }
    if (activeSection === 'book') {
      return (
        <div className="frontdesk-embed h-full min-h-0">
          <PatientEngagement sessionId={sessionId} forcedTab="book" hideTabs />
        </div>
      );
    }
    if (activeSection === 'query') {
      return (
        <div className="frontdesk-embed h-full min-h-0">
          <PatientEngagement sessionId={sessionId} forcedTab="query" hideTabs />
        </div>
      );
    }
    if (activeSection === 'engagement') {
      return <FrontDeskEngagementConsole />;
    }
    if (activeSection === 'analytics') {
      return <EngagementAnalytics />;
    }

    const deskTabMap: Record<string, 'dashboard' | 'registration' | 'billing' | 'queue' | 'reports'> = {
      dashboard: 'dashboard',
      registration: 'registration',
      billing: 'billing',
      queue: 'queue',
      reports: 'reports',
    };

    return (
      <FrontDeskDashboard
        sessionId={sessionId}
        forcedTab={deskTabMap[activeSection]}
        hideNav
      />
    );
  };

  return (
    <StaffPortalShell
      portal="frontdesk"
      topbar={
        <div className="app-topbar">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-4">
              <div className="brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white">
                AH
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-400">Frontdesk Portal</p>
                <h1 className="text-xl font-extrabold text-slate-100 sm:text-2xl">Reception & Operations</h1>
                <p className="text-sm text-slate-400">Manage appointments, billing, and patient engagement</p>
              </div>
            </div>
            <SydneyLocationSelector compact showLabel={false} />
          </div>
        </div>
      }
      sidebar={sidebar}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200/90">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
          <span>Administrative & billing access only. No clinical notes or prescription editing.</span>
        </div>
        <div className="frontdesk-content min-h-0 flex-1 overflow-hidden animate-fade-in-up tab-content-fade">
          {renderContent()}
        </div>
      </div>
    </StaffPortalShell>
  );
};

export default FrontDeskPortal;
