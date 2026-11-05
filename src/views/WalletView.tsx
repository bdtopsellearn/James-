import React, { useState } from 'react';
import {
  Wallet as WalletIcon,
  CreditCard,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  ExternalLink,
  ArrowDownLeft,
  ArrowUpRight,
  FileText
} from 'lucide-react';
import { Wallet, Transaction, BalanceRequest, PaymentMethodItem, InvoiceData } from '../types';
import { InfoCallout } from '../components/rayobyte/InfoCallout';
import { InvoiceModal } from '../components/ui/InvoiceModal';
import { PaymentDetailsPanel } from '../components/wallet/QrPaymentPanel';
import { SuperchatTopupCard } from '../components/wallet/SuperchatTopupCard';
import { formatBDT, bdtToUsd } from '../lib/currency';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';

interface WalletViewProps {
  wallet: Wallet;
  transactions: Transaction[];
  balanceRequests: BalanceRequest[];
  paymentMethods: PaymentMethodItem[];
  onSubmitDeposit: (amount: number, method: 'bkash' | 'nagad' | 'rocket' | 'binance' | 'usdt', txnId: string, senderNumber?: string) => boolean | void | Promise<boolean | void>;
}

export const WalletView: React.FC<WalletViewProps> = ({
  wallet,
  transactions,
  balanceRequests,
  paymentMethods,
  onSubmitDeposit
}) => {
  const [amount, setAmount] = useState('500');
  const [selectedMethod, setSelectedMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'binance' | 'usdt'>('bkash');
  const [txnId, setTxnId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);

  // Older data only has `id` (no `key`) — without this every method looked selected and the method sent to the server was empty.
  const mKey = (m: { key?: string; id?: string }) => String(m.key || m.id || '');
  const enabledMethods = paymentMethods.filter((m) => m.enabled !== false);
  const activeMethod = enabledMethods.find((m) => mKey(m) === selectedMethod) || enabledMethods[0];
  const activeKey = activeMethod ? mKey(activeMethod) : String(selectedMethod);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API is blocked on http / some in-app browsers — fall back to the legacy copy
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      } catch { return; }
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0 || !txnId.trim()) return;

    setSubmitting(true);
    let ok: boolean | void = false;
    try { ok = await onSubmitDeposit(val, activeKey as any, txnId.trim(), senderNumber.trim()); }
    finally { setSubmitting(false); }
    if (ok === false) return; // failed — keep the form filled in so nothing is lost (the parent shows the error)
    setTxnId('');
    setSenderNumber('');
    setSubmitSuccess(`Deposit request for ${formatBDT(val)} submitted! An admin will verify the transaction ID and credit your account.`);
    setTimeout(() => setSubmitSuccess(null), 6000);
  };

  const handleOpenRequestInvoice = (req: BalanceRequest) => {
    const inv: InvoiceData = {
      invoiceNumber: `INV-${req.id.replace('req_', '')}`,
      date: req.createdAt,
      userName: req.userName,
      userEmail: req.userEmail || 'publisher@admarketing.io',
      paymentMethod: req.method.toUpperCase(),
      transactionId: req.txnId,
      amountUSD: bdtToUsd(req.amount),
      amountBDT: req.amount,
      type: 'Deposit Request',
      description: `Wallet Balance Deposit via ${req.method.toUpperCase()} (${req.senderNumber ? `Sender: ${req.senderNumber}` : 'Direct Gateway'})`,
      status: req.status
    };
    setSelectedInvoice(inv);
  };

  const handleOpenTxInvoice = (tx: Transaction) => {
    const inv: InvoiceData = {
      invoiceNumber: `INV-${tx.id.replace('tx_', '')}`,
      date: tx.createdAt,
      userName: 'Publisher Account',
      userEmail: 'publisher.pro@admarketing.io',
      paymentMethod: tx.type === 'deposit' ? 'Direct Mobile/Crypto Gateway' : 'Internal Ledger Transfer',
      transactionId: tx.refId || tx.id,
      amountUSD: bdtToUsd(Math.abs(tx.amount)),
      amountBDT: Math.abs(tx.amount),
      type: tx.type,
      description: tx.description,
      status: tx.status
    };
    setSelectedInvoice(inv);
  };

  return (
    <div className="space-y-6">
      {/* Header & Balance Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Multi-Currency Wallet
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Top up your balance using instant mobile banking (bKash/Nagad) or direct cryptocurrency (Binance Pay/USDT TRC-20).
          </p>
        </div>

        <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-right min-w-[220px]">
          <span className="text-[11px] font-medium text-teal-800 dark:text-teal-300 uppercase tracking-wider block">
            Available Cash Balance
          </span>
          <span className="text-3xl font-extrabold font-mono text-teal-600 dark:text-teal-400 tabular-nums">
            <AnimatedNumber value={wallet.balance} format={(n) => `৳${n.toFixed(2)}`} /> <span className="text-xs font-normal text-slate-500">BDT</span>
          </span>
        </div>
      </div>

      {/* Instant, automatic top-up via SuperChat BD hosted checkout */}
      <SuperchatTopupCard initialAmount={500} />

      <InfoCallout
        title="Manual Deposit Verification (optional)"
        message="Prefer to send money yourself? Use the manual deposit below — an admin verifies the transaction ID and credits your wallet within 10-30 minutes. For instant automatic crediting, use the Instant Top-up above."
      />

      {/* 2-Column: Deposit Form & Payment Instructions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods & Quick Copy */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <PaymentDetailsPanel
            methodKey={activeKey}
            methodName={activeMethod?.name || 'selected'}
            methodNumber={activeMethod?.number || ''}
          />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            1. Select Payment Method
          </h3>

          <div className="grid grid-cols-2 gap-2.5">
            {enabledMethods.map((m) => (
              <button
                key={mKey(m)}
                type="button"
                onClick={() => setSelectedMethod(mKey(m) as any)}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  activeKey === mKey(m)
                    ? 'border-teal-600 bg-teal-50/50 dark:bg-teal-950/40 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                  {m.name}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {m.accountType || m.type}
                </span>
              </button>
            ))}
          </div>

          {/* Details & Copy Box for Selected Method */}
          {activeMethod && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Recipient Account / Address:</span>
                <span className="text-[10px] text-teal-600 font-semibold">{activeMethod.name}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700">
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 select-all truncate">
                  {activeMethod.number}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(activeMethod.number, activeKey)}
                  className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-teal-600 hover:bg-teal-700 text-white cursor-pointer transition-colors"
                >
                  {copiedKey === activeKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === activeKey ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                <strong>Instructions:</strong> {activeMethod.instructions}{activeMethod.note ? ` ${activeMethod.note}` : ''}
              </p>
            </div>
          )}
        </div>

        {/* Deposit Verification Form */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            2. Submit Transaction Proof
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Deposit Amount (৳ BDT)
              </label>
              <div className="grid grid-cols-2 min-[400px]:grid-cols-4 gap-2 mb-2">
                {[500, 1000, 2000, 5000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(val.toString())}
                    className={`py-1.5 text-xs font-mono font-semibold rounded-md border cursor-pointer ${
                      amount === val.toString()
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    ৳{val}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="50"
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter custom amount (BDT)"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Transaction ID / Blockchain Hash (TXN ID)
              </label>
              <input
                type="text"
                required
                value={txnId}
                onChange={(e) => setTxnId(e.target.value)}
                placeholder="e.g. 9K29104BA or 0x4fae8912..."
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 uppercase"
              />
            </div>

            {(selectedMethod === 'bkash' || selectedMethod === 'nagad' || selectedMethod === 'rocket') && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Sender Mobile Number (Optional)
                </label>
                <input
                  type="text"
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                  placeholder="e.g. 01712000000"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            )}

            {submitSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{submitSuccess}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting ? 'Submitting…' : 'Submit Deposit Confirmation'}
            </button>
          </form>
        </div>
      </div>

      {/* Pending Balance Requests Section */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Recent Deposit Submissions
          </h3>
          <span className="text-[11px] text-slate-400">
            {balanceRequests.length} requests on record
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">TXN ID</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Admin Note</th>
                <th className="py-3 px-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {balanceRequests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {new Date(req.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 uppercase font-semibold text-slate-700 dark:text-slate-300">
                    {req.method}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                    ৳{req.amount.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 font-mono text-teal-600 dark:text-teal-400 font-semibold">
                    {req.txnId}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${
                        req.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : req.status === 'rejected'
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      {req.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-[11px]">
                    {req.adminNote || 'Pending verification'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenRequestInvoice(req)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-teal-600 dark:text-teal-400 cursor-pointer transition-colors shadow-2xs"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Invoice</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ledger History */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Wallet Balance Ledger
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4 text-right">Balance After</th>
                <th className="py-3 px-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                    {tx.description}
                  </td>
                  <td className="py-3 px-4 uppercase text-[10px] font-semibold text-slate-500">
                    {tx.type}
                  </td>
                  <td className={`py-3 px-4 font-mono font-bold tabular-nums ${tx.amount > 0 ? 'text-emerald-600' : 'text-slate-900 dark:text-slate-100'}`}>
                    {tx.amount > 0 ? `+৳${tx.amount.toFixed(2)}` : `-৳${Math.abs(tx.amount).toFixed(2)}`}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 text-right tabular-nums">
                    ৳{tx.balanceAfter.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenTxInvoice(tx)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-teal-600 cursor-pointer transition-colors shadow-2xs"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Receipt</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Modal */}
      <InvoiceModal
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
    </div>
  );
};
