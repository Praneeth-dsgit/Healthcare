import React from 'react';

interface LoadingDotsProps {
  tone?: 'light' | 'dark';
}

const LoadingDots: React.FC<LoadingDotsProps> = ({ tone = 'light' }) => {
  const dotClass = tone === 'dark' ? 'bg-sky-400' : 'bg-blue-500';
  const labelClass = tone === 'dark' ? 'text-slate-400' : 'text-gray-500';

  return (
    <div className="flex items-center space-x-3">
      <div className="healthcare-loading"></div>
      <div className="flex space-x-2">
        <div className={`h-2 w-2 animate-pulse rounded-full ${dotClass}`} style={{ animationDelay: '0ms' }} />
        <div className={`h-2 w-2 animate-pulse rounded-full ${dotClass}`} style={{ animationDelay: '300ms' }} />
        <div className={`h-2 w-2 animate-pulse rounded-full ${dotClass}`} style={{ animationDelay: '600ms' }} />
      </div>
      <span className={`text-sm font-medium ${labelClass}`}>Analyzing...</span>
    </div>
  );
};

export default LoadingDots;