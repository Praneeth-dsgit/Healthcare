/**
 * Billing Dashboard Component
 * View bills and make payments
 */

import React, { useState, useEffect } from 'react';
import { CreditCard, Download, Calendar, CheckCircle, Clock, XCircle, DollarSign } from 'lucide-react';
import { billingService, Billing, Payment, PaymentData } from '../../services/billingService';
import {
  PortalPageShell,
  PortalPageHero,
  PortalLoading,
  PortalStatCard,
  portalInputClass,
} from '../patient/portalPageLayout';

const BillingDashboard: React.FC = () => {
  const [bills, setBills] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<Billing | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData>({
    billing_id: 0,
    payment_method: 'upi',
    amount: 0,
  });
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    loadBills();
  }, [filterStatus]);

  const loadBills = async () => {
    setLoading(true);
    try {
      const result = await billingService.getBills({
        status: filterStatus || undefined,
      });
      if (result.success && result.bills) {
        setBills(result.bills);
      }
    } catch (error) {
      console.error('Error loading bills:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMakePayment = (bill: Billing) => {
    setSelectedBill(bill);
    setPaymentData({
      billing_id: bill.billing_id,
      payment_method: 'upi',
      amount: bill.final_amount - (bill.status === 'partial' ? bill.total_amount : 0),
    });
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async () => {
    try {
      const result = await billingService.makePayment(paymentData);
      if (result.success) {
        setShowPaymentModal(false);
        await loadBills();
      }
    } catch (error) {
      console.error('Error making payment:', error);
    }
  };

  const handleDownloadInvoice = async (billingId: number) => {
    try {
      const blob = await billingService.downloadInvoice(billingId);
      if (blob) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${billingId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading invoice:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'partial':
        return <Clock className="h-5 w-5 text-orange-600" />;
      default:
        return <XCircle className="h-5 w-5 text-red-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'partial':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-red-100 text-red-800';
    }
  };

  if (loading) {
    return <PortalLoading message="Loading bills…" />;
  }

  const pendingCount = bills.filter((b) => b.status === 'pending' || b.status === 'partial').length;
  const totalAmount = bills.reduce((sum, b) => sum + b.final_amount, 0);

  return (
    <PortalPageShell>
        <PortalPageHero
          eyebrow="Payments"
          title="Billing & Payments"
          subtitle="View invoices, track payment status, and download receipts."
          icon={<CreditCard />}
          actions={
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={`${portalInputClass} w-full min-w-[10rem] sm:w-44`}
            >
              <option value="">All status</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          }
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <PortalStatCard label="Total bills" value={bills.length} icon={<CreditCard className="h-8 w-8" />} accent="sky" />
          <PortalStatCard label="Pending / partial" value={pendingCount} icon={<Clock className="h-8 w-8" />} accent="amber" />
          <PortalStatCard
            label="Total amount"
            value={`₹${totalAmount.toLocaleString()}`}
            icon={<DollarSign className="h-8 w-8" />}
            accent="emerald"
          />
        </div>

        {/* Bills List */}
        {bills.length === 0 ? (
          <div className="premium-card p-12 text-center">
            <CreditCard className="mx-auto mb-4 h-12 w-12 text-slate-600" />
            <p className="text-slate-400">No bills found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bills.map((bill) => (
              <div key={bill.billing_id} className="premium-card p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-bold text-slate-100">Bill #{bill.billing_id}</h3>
                      <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(bill.status)}`}>
                        {getStatusIcon(bill.status)}
                        {bill.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                      <div>
                        <p className="text-slate-500">Total</p>
                        <p className="font-semibold text-slate-200">₹{bill.total_amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Discount</p>
                        <p className="font-semibold text-slate-200">₹{bill.discount_amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Tax</p>
                        <p className="font-semibold text-slate-200">₹{bill.tax_amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Final</p>
                        <p className="font-semibold text-teal-300">₹{bill.final_amount.toLocaleString()}</p>
                      </div>
                    </div>
                    {bill.due_date && (
                      <p className="mt-2 flex items-center text-sm text-slate-500">
                        <Calendar className="mr-1 h-4 w-4" />
                        Due: {new Date(bill.due_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadInvoice(bill.billing_id)}
                      className="ghost-button flex items-center rounded-lg px-4 py-2 text-sm font-bold"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Invoice
                    </button>
                    {bill.status !== 'paid' && (
                      <button
                        type="button"
                        onClick={() => handleMakePayment(bill)}
                        className="portal-accent-button rounded-lg px-4 py-2 text-sm font-bold"
                      >
                        Pay Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showPaymentModal && selectedBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="modal-surface w-full max-w-md p-6">
              <h2 className="mb-4 text-lg font-bold text-slate-100">Make Payment</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-500">Amount to pay</p>
                  <p className="text-2xl font-bold text-teal-300">₹{paymentData.amount.toLocaleString()}</p>
                </div>
                <div>
                  <label className="form-label mb-1.5 block">Payment method</label>
                  <select
                    value={paymentData.payment_method}
                    onChange={(e) => setPaymentData({ ...paymentData, payment_method: e.target.value as PaymentData['payment_method'] })}
                    className={portalInputClass}
                  >
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="net_banking">Net Banking</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                {paymentData.payment_method === 'card' && (
                  <div>
                    <label className="form-label mb-1.5 block">Transaction ID</label>
                    <input
                      type="text"
                      value={paymentData.transaction_id || ''}
                      onChange={(e) => setPaymentData({ ...paymentData, transaction_id: e.target.value })}
                      className={portalInputClass}
                      placeholder="Enter transaction ID"
                    />
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handlePaymentSubmit}
                    className="portal-accent-button flex-1 rounded-lg py-2.5 text-sm font-bold"
                  >
                    Pay ₹{paymentData.amount.toLocaleString()}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="ghost-button flex-1 rounded-lg py-2.5 text-sm font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </PortalPageShell>
  );
};

export default BillingDashboard;

