/**
 * Patient payment panel for telemedicine visit room.
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle, CreditCard } from 'lucide-react';
import { telemedicineService, type VisitPayment } from '../../services/telemedicineService';

interface TelemedicinePaymentPanelProps {
  visitId: string;
  fee: number;
  onPaid?: () => void;
}

const TelemedicinePaymentPanel: React.FC<TelemedicinePaymentPanelProps> = ({
  visitId,
  fee,
  onPaid,
}) => {
  const [payment, setPayment] = useState<VisitPayment | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    telemedicineService.getPayment(visitId).then((r) => setPayment(r.payment ?? null));
  }, [visitId]);

  const handlePay = async () => {
    setPaying(true);
    setError(null);
    const result = await telemedicineService.submitPayment(visitId, fee);
    setPaying(false);
    if (result.success && result.payment) {
      setPayment(result.payment);
      onPaid?.();
    } else {
      setError('Payment could not be processed');
    }
  };

  const amount = payment?.amount ?? fee;
  const isPaid = payment?.status === 'paid';

  return (
    <div className="p-4">
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-teal-400" />
          <p className="text-sm font-semibold text-slate-200">Visit Payment</p>
        </div>
        <p className="text-2xl font-bold text-teal-300">₹{amount}</p>
        <p className="text-xs text-slate-500">Consultation fee · Telehealth</p>

        {isPaid ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-300">
            <CheckCircle className="h-4 w-4" />
            Payment confirmed
            {payment?.paidAt && (
              <span className="ml-auto text-[10px] font-normal text-emerald-400/80">
                {new Date(payment.paidAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={paying}
              onClick={() => void handlePay()}
              className="primary-button mt-4 w-full rounded-xl py-2 text-sm font-semibold disabled:opacity-50"
            >
              {paying ? 'Processing…' : 'Pay Now'}
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-500">
              Your doctor will be notified when payment is complete.
            </p>
          </>
        )}

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
};

export default TelemedicinePaymentPanel;
