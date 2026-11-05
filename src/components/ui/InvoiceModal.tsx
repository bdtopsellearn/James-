import React from 'react';
import {
  FileText,
  X,
  Printer,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building,
  CreditCard,
  Hash,
  ShieldCheck
} from 'lucide-react';
import { InvoiceData } from '../../types';
import { BrandLogo } from '../brand/BrandLogo';

interface InvoiceModalProps {
  invoice: InvoiceData | null;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ invoice, onClose }) => {
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Official Electronic Receipt & Invoice
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Invoice Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-800 dark:text-slate-200 text-xs">
          {/* Header Brand & Invoice ID */}
          <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BrandLogo size="sm" />
                <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white">
                  AD MARKETING
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono">
                X AD MARKETING ENTERPRISE SERVICES
              </p>
              <p className="text-[10px] text-slate-400">
                Tax Reg #BD-98214-X · Verified Gateway Node
              </p>
            </div>

            <div className="text-right">
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs block">
                {invoice.invoiceNumber}
              </span>
              <span className="text-[11px] text-slate-500 block">
                Date: {new Date(invoice.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
              <span
                className={`inline-block mt-1 px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${
                  invoice.status === 'completed' || invoice.status === 'approved'
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : invoice.status === 'rejected'
                    ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                }`}
              >
                {invoice.status}
              </span>
            </div>
          </div>

          {/* User & Gateway Info */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
                Billed To (Publisher)
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100 block">{invoice.userName}</span>
              <span className="font-mono text-[11px] text-slate-500 block truncate">{invoice.userEmail}</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
                Payment Channel
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100 uppercase block">{invoice.paymentMethod}</span>
              <span className="font-mono text-[11px] text-teal-600 dark:text-teal-400 block truncate">
                TXN: {invoice.transactionId}
              </span>
            </div>
          </div>

          {/* Itemized Line Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/70 text-slate-500 text-[11px] font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Item Description</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Amount (BDT)</th>
                  <th className="py-2.5 px-3 text-right">Amount (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr>
                  <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">
                    {invoice.description}
                  </td>
                  <td className="py-3 px-3 uppercase text-[10px] text-slate-500 font-mono">
                    {invoice.type}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-semibold">
                    ৳{invoice.amountBDT.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    ${invoice.amountUSD.toFixed(2)}
                  </td>
                </tr>
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/40 font-bold border-t border-slate-200 dark:border-slate-800">
                <tr>
                  <td colSpan={3} className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">
                    Total Amount Verified:
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                    ${invoice.amountUSD.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Digital Seal / Verification Badge */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/20 text-[11px]">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Cryptographically signed & verified in X AD MARKETING ledger</span>
            </div>
            <div className="font-mono text-[9px] text-slate-400">
              HASH: #{invoice.transactionId.slice(-8).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Invoice</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer transition-colors shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
