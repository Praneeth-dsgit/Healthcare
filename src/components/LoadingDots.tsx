import React from 'react';

const LoadingDots: React.FC = () => {
  return (
    <div className="flex space-x-2">
      <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '0ms' }}></div>
      <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '300ms' }}></div>
      <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '600ms' }}></div>
    </div>
  );
};

export default LoadingDots;