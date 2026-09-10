/**
 * Response shapes `api-1.yaml` leaves undefined.
 *
 * Every type in this file is a best reading of the endpoint's documentation,
 * not a spec-derived contract. When Chari Pay publishes a schema, delete the
 * type here and use the generated one instead.
 */

import type { components } from '../generated/api.js';

/** `GET /checkout/payments/{reference}` — the spec defines this one. */
export type PublicPaymentStatus = components['schemas']['PublicPaymentStatusResponse'];

/**
 * `GET /v1/wallet`
 * @remarks Not defined in api-1.yaml; modelled from the endpoint description.
 * Verify against sandbox before 1.0.0.
 */
export interface WalletBalance {
  balance: number;
  currency?: string;
  availableBalance?: number;
  pendingBalance?: number;
  [key: string]: unknown;
}

/**
 * `GET /v1/wallet/account`
 * @remarks Not defined in api-1.yaml; modelled from the endpoint description.
 * Verify against sandbox before 1.0.0.
 */
export interface WalletAccount {
  rib?: string;
  iban?: string;
  bic?: string;
  accountHolder?: string;
  bankName?: string;
  [key: string]: unknown;
}

/**
 * `GET /v1/transactions` item.
 * @remarks Not defined in api-1.yaml; modelled from the endpoint description.
 * Verify against sandbox before 1.0.0.
 */
export interface Transaction {
  operationId?: string | number;
  reference?: string;
  amount?: number;
  currency?: string;
  status?: 'PENDING' | 'PENDING_3DS' | 'SUCCESS' | 'FAILED' | 'CANCELED';
  type?: 'PAYMENT' | 'REFUND' | 'BILL_PAYMENT' | 'BANK_TRANSFER';
  method?: string;
  channel?: string;
  settlementId?: string;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * `GET /v1/transactions/{operationId}/timeline` entry.
 * @remarks Not defined in api-1.yaml; modelled from the endpoint description.
 * Verify against sandbox before 1.0.0.
 */
export interface TransactionTimelineEntry {
  at?: string;
  status?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * `GET /v1/products/{reference}/orders` item.
 * @remarks Not defined in api-1.yaml; modelled from the endpoint description.
 * Verify against sandbox before 1.0.0.
 */
export interface ProductOrder {
  reference?: string;
  productReference?: string;
  quantity?: number;
  amount?: number;
  status?: string;
  customerName?: string;
  createdAt?: string;
  [key: string]: unknown;
}
