import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { PortalId } from '../../theme/portalThemes';
import { getPortalTheme } from '../../theme/portalThemes';

interface StaffPortalShellProps {
  portal: PortalId;
  topbar?: React.ReactNode;
  sidebar?: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const StaffPortalShell: React.FC<StaffPortalShellProps> = ({
  portal,
  topbar,
  sidebar,
  header,
  footer,
  children,
  className = '',
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const theme = getPortalTheme(portal);

  return (
    <div
      className={`app-shell flex h-screen flex-col overflow-hidden ${className}`}
      data-portal={portal}
    >
      {topbar}

      {header && (
        <div className="border-b border-slate-700/50 bg-slate-900/40 px-4 py-4 backdrop-blur-sm sm:px-6">
          {header}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {sidebar && (
          <>
            <aside className="sidebar-surface hidden w-60 shrink-0 flex-col md:flex">
              <div className="border-b border-slate-700/50 px-4 py-3">
                <p className={`text-xs font-bold uppercase tracking-wide ${theme.textClass}`}>
                  {theme.label}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-3">{sidebar}</div>
            </aside>

            {mobileNavOpen && (
              <div
                className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
                onClick={() => setMobileNavOpen(false)}
                aria-hidden
              />
            )}
            <aside
              className={`sidebar-surface fixed inset-y-0 left-0 z-50 flex w-72 flex-col transition-transform duration-300 md:hidden ${
                mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
                <p className={`text-xs font-bold uppercase tracking-wide ${theme.textClass}`}>
                  {theme.label}
                </p>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">{sidebar}</div>
            </aside>
          </>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {sidebar && (
            <div className="flex items-center border-b border-slate-700/50 bg-slate-900/90 px-4 py-2 md:hidden">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </main>
      </div>

      {footer}
    </div>
  );
};

export default StaffPortalShell;
