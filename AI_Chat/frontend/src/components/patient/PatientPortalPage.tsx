import React from 'react';

interface PatientPortalPageProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | '7xl' | 'full';
}

const maxWidthClass: Record<NonNullable<PatientPortalPageProps['maxWidth']>, string> = {
  md: 'max-w-3xl',
  lg: 'max-w-4xl',
  xl: 'max-w-5xl',
  '2xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
};

const PatientPortalPage: React.FC<PatientPortalPageProps> = ({
  title,
  subtitle,
  children,
  className = '',
  maxWidth = '7xl',
}) => (
  <div className={`patient-portal-page mx-auto w-full p-4 sm:p-6 lg:p-8 ${maxWidthClass[maxWidth]} ${className}`}>
    {(title || subtitle) && (
      <header className="mb-6">
        {title && <h1 className="section-heading text-2xl font-extrabold sm:text-3xl">{title}</h1>}
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </header>
    )}
    {children}
  </div>
);

export default PatientPortalPage;
