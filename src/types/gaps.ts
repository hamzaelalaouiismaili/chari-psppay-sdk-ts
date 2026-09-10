/**
 * Response shapes `api-1.yaml` leaves undefined.
 *
 * Every type in this file is a best reading of the endpoint's documentation,
 * not a spec-derived contract. When Chari Pay publishes a schema, delete the
 * type here and use the generated one instead.
 */

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
