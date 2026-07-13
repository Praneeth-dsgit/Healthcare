/**
 * Billing Service - API calls for billing and payments
 */

import { getAuthHeaders, authenticatedFetch } from './authService';
import { getApiRoot } from '../utils/apiBase';

const API_BASE = getApiRoot();

export interface Billing {
  billing_id: number;
  patient_id: string;
  family_member_id?: number;
  appointment_id?: number;
  radiology_booking_id?: number;
  admission_id?: number;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  final_amount: number;
  status: 'pending' | 'partial' | 'paid' | 'cancelled';
  due_date?: string;
  created_at: string;
  items?: BillingItem[];
}

export interface BillingItem {
  item_id: number;
  billing_id: number;
  item_name: string;
  item_type: 'consultation' | 'procedure' | 'medication' | 'lab_test' | 'radiology' | 'room_charge' | 'other';
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Payment {
  payment_id: number;
  billing_id: number;
  payment_method: 'cash' | 'card' | 'upi' | 'net_banking' | 'insurance' | 'other';
  amount: number;
  transaction_id?: string;
  payment_date: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  notes?: string;
}

export interface PaymentData {
  billing_id: number;
  payment_method: 'cash' | 'card' | 'upi' | 'net_banking' | 'insurance' | 'other';
  amount: number;
  transaction_id?: string;
  notes?: string;
}

class BillingService {
  private getPatientId(): string | null {
    return sessionStorage.getItem('patient_id');
  }

  private getHeaders(): HeadersInit {
    const headers = { ...getAuthHeaders() } as Record<string, string>;
    const patientId = this.getPatientId();
    if (patientId) {
      headers['X-Patient-ID'] = patientId;
    }
    return headers;
  }

  async getBills(params?: {
    status?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{ success: boolean; bills?: Billing[]; error?: string }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.status) queryParams.append('status', params.status);
      if (params?.start_date) queryParams.append('start_date', params.start_date);
      if (params?.end_date) queryParams.append('end_date', params.end_date);

      const url = `${API_BASE}/patient/billing${queryParams.toString() ? `?${queryParams}` : ''}`;
      const response = await authenticatedFetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getBill(billingId: number): Promise<{ success: boolean; bill?: Billing; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/patient/billing/${billingId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async makePayment(paymentData: PaymentData): Promise<{ success: boolean; payment?: Payment; error?: string }> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/patient/billing/payments`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(paymentData),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getPaymentHistory(billingId?: number): Promise<{ success: boolean; payments?: Payment[]; error?: string }> {
    try {
      const url = billingId
        ? `${API_BASE}/patient/billing/payments?billing_id=${billingId}`
        : `${API_BASE}/patient/billing/payments`;
      const response = await authenticatedFetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async downloadInvoice(billingId: number): Promise<Blob | null> {
    try {
      const response = await authenticatedFetch(`${API_BASE}/patient/billing/${billingId}/invoice`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return await response.blob();
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}

export const billingService = new BillingService();
