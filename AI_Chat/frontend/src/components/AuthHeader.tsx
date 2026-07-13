import React from 'react';

const AuthHeader: React.FC = () => {
  return (
    <header className="app-topbar sticky top-0 z-40">
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white">
            AH
          </div>
          <div>
            <h1 className="brand-title text-xl font-extrabold">Acufore Health</h1>
            <p className="text-xs font-semibold text-slate-500">Healthcare Management</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AuthHeader;
