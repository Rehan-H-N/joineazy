import React, { useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

interface LayoutShellProps {
  navItems: NavItem[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  breadcrumbTitle: string;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}

export function LayoutShell({
  navItems,
  activeTab,
  onSelectTab,
  breadcrumbTitle,
  primaryAction,
  children,
}: LayoutShellProps) {
  const { user, logout, wsConnected, onlineCount } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const roleLabel = user?.role === 'admin' ? 'Professor Portal' : 'Student Portal';
  const idLabel = user?.role === 'admin' ? user.facultyId : user?.studentId;

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="h-16 px-6 flex items-center border-b border-slate-200">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
          Joineazy
        </span>
      </div>

      <nav className="flex-1 p-4 space-y-1" aria-label="Workspace navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                setMobileOpen(false);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full h-10 px-3 rounded-lg flex items-center justify-between text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-50 text-blue-800'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge !== undefined && (
                <span className="text-xs font-mono tabular-nums text-slate-500 ml-2">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div className="text-xs text-slate-500 space-y-0.5">
          <p className="font-medium text-slate-900 truncate">{user?.name}</p>
          <p className="truncate">
            {roleLabel}
            {idLabel ? ` · ${idLabel}` : ''}
          </p>
          <p className="truncate text-slate-500">{user?.department}</p>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>{wsConnected ? `Live sync · ${Math.max(1, onlineCount)} online` : 'Reconnecting...'}</span>
        </div>

        <button
          type="button"
          onClick={logout}
          className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile slide-over navigation */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[80vw] bg-white h-full border-r border-slate-200">
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">{roleLabel}</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
              <h1 className="font-display font-semibold text-slate-900 truncate">{breadcrumbTitle}</h1>
            </div>
          </div>

          {primaryAction && <div className="shrink-0">{primaryAction}</div>}
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1200px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
