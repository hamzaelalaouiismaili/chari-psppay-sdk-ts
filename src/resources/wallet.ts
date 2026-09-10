import type { components } from '../generated/api.js';
import type { ChariPayFile } from '../file.js';
import type { RequestOptions } from '../http.js';
import type { WalletAccount, WalletBalance } from '../types/gaps.js';
import { BaseResource } from './base.js';

export type WalletCashInParams = components['schemas']['WalletCashinRequest'];
export type WalletCashInResponse = components['schemas']['WalletCashinResponse'];

/** Your Chari Pay wallet: balance, bank coordinates, and sandbox top-ups. */
export class WalletResource extends BaseResource {
  /** Current wallet balance in MAD. */
  balance(options?: RequestOptions): Promise<WalletBalance> {
    return this.http.request<WalletBalance>({ method: 'GET', path: '/v1/wallet', options });
  }

  /** Bank coordinates for the wallet (RIB / IBAN / BIC). */
  account(options?: RequestOptions): Promise<WalletAccount> {
    return this.http.request<WalletAccount>({ method: 'GET', path: '/v1/wallet/account', options });
  }

  /** The RIB as a PDF document. */
  ribDocument(options?: RequestOptions): Promise<ChariPayFile> {
    return this.http.requestBinary({ method: 'GET', path: '/v1/wallet/account/rib-document', options });
  }

  /** Credits the wallet. Sandbox only. */
  cashIn(params: WalletCashInParams, options?: RequestOptions): Promise<WalletCashInResponse> {
    return this.http.request<WalletCashInResponse>({
      method: 'POST',
      path: '/v1/wallet/cash-ins',
      body: params,
      autoIdempotency: true,
      options,
    });
  }
}
