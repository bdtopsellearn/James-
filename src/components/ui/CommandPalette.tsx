import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, Command as CommandIcon } from 'lucide-react';

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface CommandPaletteProps {
  items: CommandItem[];
  onSelect: (id: string) => void;
}

/**
 * Global quick-navigation palette. Opens with Ctrl/Cmd + K, filters the supplied
 * pages/actions, and navigates on Enter or click. Fully keyboard accessible.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ items, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      `${it.label} ${it.group} ${it.keywords || ''}`.toLowerCase().includes(q)
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filtered.forEach((it) => {
      if (!map.has(it.group)) map.set(it.group, []);
      map.get(it.group)!.push(it);
    });
    return Array.from(map.entries());
  }, [filtered]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  const choose = (item?: CommandItem) => {
    const target = item || filtered[activeIndex];
    if (!target) return;
    onSelect(target.id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(); }
  };

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center pt-[12vh] px-4"
      onMouseDown={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages and actions…"
            className="flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-400">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">No matching pages.</div>
          )}
          {grouped.map(([group, groupItems]) => (
            <div key={group} className="mb-1">
              <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</div>
              {groupItems.map((it) => {
                runningIndex += 1;
                const idx = runningIndex;
                const Icon = it.icon;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => choose(it)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {Icon ? <Icon className="w-4 h-4 shrink-0" /> : <span className="w-4 h-4 shrink-0" />}
                    <span className="flex-1 truncate">{it.label}</span>
                    {isActive && <CornerDownLeft className="w-3.5 h-3.5 opacity-60" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><CommandIcon className="w-3 h-3" /> + K to toggle</span>
          <span>↑↓ navigate · ↵ open</span>
        </div>
      </div>
    </div>
  );
};
