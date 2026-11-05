import React, { useEffect, useState } from 'react';
import { X, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { apiGetTerms, FALLBACK_TERMS, type TermsData } from '../../services/api';

interface TermsModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional pre-loaded terms (avoids a second fetch). */
  terms?: TermsData | null;
}

/**
 * A polished, scrollable Terms & Conditions viewer used on the sign-up page
 * (and anywhere else the terms need to be shown). Content is loaded live from
 * the server so admin edits show up instantly.
 */
export const TermsModal: React.FC<TermsModalProps> = ({ open, onClose, terms }) => {
  const [data, setData] = useState<TermsData | null>(terms || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (terms) {
      setData(terms);
      return;
    }
    let alive = true;
    setLoading(true);
    apiGetTerms()
      .then((t) => {
        if (alive) setData(t || FALLBACK_TERMS);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, terms]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const content = data?.content || FALLBACK_TERMS.content;
  const version = data?.version || FALLBACK_TERMS.version;
  const updatedAt = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Terms and Conditions"
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-teal-600/10 to-emerald-600/10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/30">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Terms &amp; Conditions</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Version {version}
              {updatedAt ? ` \u00b7 Updated ${updatedAt}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
              {content}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/50">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
            Please read carefully before accepting.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 hover:brightness-110 text-white text-sm font-semibold shadow-lg shadow-teal-500/30 transition-all active:scale-[0.98] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsModal;
