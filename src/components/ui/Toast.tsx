import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (title: string, message?: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((title: string, message?: string, type: ToastType = 'success') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed z-[60] left-2 right-2 sm:left-auto sm:right-4 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 flex flex-col gap-2 sm:max-w-sm sm:w-full pointer-events-none select-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-bottom-5 duration-200 text-xs ${
              toast.type === 'success'
                ? 'bg-white dark:bg-[#0f172a]/95 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                : toast.type === 'error'
                ? 'bg-white dark:bg-[#0f172a]/95 border-rose-500/40 text-rose-700 dark:text-rose-300'
                : toast.type === 'warning'
                ? 'bg-white dark:bg-[#0f172a]/95 border-amber-500/40 text-amber-700 dark:text-amber-300'
                : 'bg-white dark:bg-[#0f172a]/95 border-sky-500/40 text-sky-700 dark:text-sky-300'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
              {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
              {toast.type === 'info' && <Info className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
            </div>

            <div className="flex-1 min-w-0">
              <span className="font-bold text-slate-900 dark:text-white block">{toast.title}</span>
              {toast.message && (
                <span className="text-slate-400 block text-[11px] mt-0.5 leading-snug">
                  {toast.message}
                </span>
              )}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0 p-1.5 -m-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
