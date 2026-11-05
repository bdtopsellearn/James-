import React from 'react';
import { Info, ExternalLink } from 'lucide-react';

interface InfoCalloutProps {
  title?: string;
  message: string;
  linkText?: string;
  linkUrl?: string;
  onLinkClick?: () => void;
  type?: 'info' | 'success' | 'warning';
}

export const InfoCallout: React.FC<InfoCalloutProps> = ({
  title,
  message,
  linkText,
  linkUrl,
  onLinkClick,
  type = 'info'
}) => {
  const styles = {
    info: 'bg-sky-50/80 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/60 text-sky-900 dark:text-sky-200',
    success: 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200',
    warning: 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
  };

  const iconColors = {
    info: 'text-sky-600 dark:text-sky-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400'
  };

  return (
    <div className={`flex items-start gap-3 p-3.5 rounded-lg border text-xs leading-relaxed ${styles[type]}`}>
      <Info className={`w-4 h-4 shrink-0 mt-0.5 ${iconColors[type]}`} />
      <div className="flex-1">
        {title && <span className="font-semibold block mb-0.5">{title}</span>}
        <span>{message}</span>
        {(linkText || linkUrl) && (
          <span className="inline-block ml-1.5 font-medium">
            <a
              href={linkUrl || '#'}
              onClick={(e) => {
                if (onLinkClick) {
                  e.preventDefault();
                  onLinkClick();
                }
              }}
              className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
            >
              {linkText || 'Learn more'}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </span>
        )}
      </div>
    </div>
  );
};
