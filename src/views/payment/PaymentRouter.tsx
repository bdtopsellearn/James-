import React, { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { parsePaymentPath } from './paymentRoutes';

const CheckoutView = lazy(() => import('./CheckoutView').then((m) => ({ default: m.CheckoutView })));
const PaymentResultView = lazy(() => import('./PaymentResultView').then((m) => ({ default: m.PaymentResultView })));

const FullScreenLoader: React.FC = () => (
  <div className="flex min-h-dvh items-center justify-center bg-[#070b14]">
    <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
  </div>
);

const NotFound: React.FC = () => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#070b14] px-6 text-center text-slate-300">
    <h1 className="text-lg font-bold text-white">Payment page not found</h1>
    <p className="text-sm text-slate-500">The link you followed is invalid.</p>
    <a href="/wallet" className="mt-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15">
      Back to Wallet
    </a>
  </div>
);

/**
 * Standalone router for /checkout/:id and /payment/* — rendered OUTSIDE the
 * dashboard shell so redirected customers get a clean, full-screen page.
 */
export const PaymentRouter: React.FC = () => {
  // Force the dark theme while a payment page is on screen.
  useEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains('dark');
    root.classList.add('dark');
    return () => { if (!had) root.classList.remove('dark'); };
  }, []);

  const route = parsePaymentPath(window.location.pathname);

  return (
    <Suspense fallback={<FullScreenLoader />}>
      {route.view === 'checkout' && route.paymentId && (
        <CheckoutView paymentId={route.paymentId} />
      )}
      {route.view === 'result' && route.paymentId && route.kind && (
        <PaymentResultView paymentId={route.paymentId} kind={route.kind} />
      )}
      {route.view === 'unknown' && <NotFound />}
    </Suspense>
  );
};

export default PaymentRouter;
