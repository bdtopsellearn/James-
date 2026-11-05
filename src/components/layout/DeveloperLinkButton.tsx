import React, { useEffect, useState } from 'react';
import { Code2, ExternalLink } from 'lucide-react';
import { apiGetDeveloperLink, DeveloperLinkConfig } from '../../services/api';

/** "Developer" button shown next to Support Desk. Title / URL / ON-OFF / visibility are managed by admin. */
export const DeveloperLinkButton: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const [cfg, setCfg] = useState<DeveloperLinkConfig | null>(null);

  useEffect(() => {
    let alive = true;
    apiGetDeveloperLink().then((c) => { if (alive) setCfg(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!cfg || !cfg.show || !/^https:\/\//i.test(cfg.url)) return null;

  return (
    <a
      href={cfg.url}
      target="_blank"
      rel="noopener noreferrer"
      title={cfg.title}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
    >
      <Code2 className="w-4 h-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{cfg.title}</span>
          <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
        </>
      )}
    </a>
  );
};
