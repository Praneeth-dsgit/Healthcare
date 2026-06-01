import React from 'react';

export interface StaffMarkdownVariant {
  isStaff: boolean;
}

export function createStaffMarkdownComponents({ isStaff }: StaffMarkdownVariant) {
  const heading2 = isStaff ? 'text-slate-100' : 'text-gray-900';
  const heading3 = isStaff ? 'text-slate-200' : 'text-gray-800';
  const body = isStaff ? 'text-slate-300' : 'text-gray-700';
  const strong = isStaff ? 'text-slate-100' : 'text-gray-900';
  const border = isStaff ? 'border-slate-600' : 'border-gray-200';
  const blockquote = isStaff
    ? 'border-sky-500/50 bg-slate-900/40 text-slate-300'
    : 'border-blue-200 bg-blue-50/50 text-gray-700';

  return {
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p {...props} className={`mb-3 leading-relaxed last:mb-0 ${body}`}>
        {children}
      </p>
    ),
    h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2
        {...props}
        className={`mb-2 mt-5 border-b pb-1.5 text-sm font-bold uppercase tracking-wide first:mt-0 ${heading2} ${border}`}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3 {...props} className={`mb-1.5 mt-3 text-sm font-semibold ${heading3}`}>
        {children}
      </h3>
    ),
    h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h4 {...props} className={`mb-1 mt-2 text-sm font-medium ${heading3}`}>
        {children}
      </h4>
    ),
    strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <strong {...props} className={`font-semibold ${strong}`}>
        {children}
      </strong>
    ),
    em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <em {...props} className="italic">
        {children}
      </em>
    ),
    ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
      <ul {...props} className={`mb-3 list-disc space-y-1.5 pl-5 ${body}`}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
      <ol {...props} className={`mb-3 list-decimal space-y-1.5 pl-5 ${body}`}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
      <li {...props} className="leading-relaxed">
        {children}
      </li>
    ),
    hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
      <hr {...props} className={`my-4 ${border}`} />
    ),
    blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
      <blockquote
        {...props}
        className={`my-3 border-l-4 py-1 pl-3 text-sm italic ${blockquote}`}
      >
        {children}
      </blockquote>
    ),
  };
}
