import type { ChariPayFile } from '../file.js';
import type { RequestOptions } from '../http.js';
import type { PagePromise, PaginationParams } from '../pagination.js';
import type { Transaction, TransactionTimelineEntry } from '../types/gaps.js';
import { BaseResource } from './base.js';

export interface ListTransactionsParams extends PaginationParams {
  status?: Transaction['status'];
  type?: Transaction['type'];
  method?: string;
  channel?: string;
  settlementId?: string;
  /** Free-text search across reference, customer, and description. */
  search?: string;
  /** ISO-8601 lower bound, inclusive. */
  from?: string;
  /** ISO-8601 upper bound, inclusive. */
  to?: string;
  cursor?: string;
  limit?: number;
}

/** Money movements on your wallet: payments, refunds, transfers. */
export class TransactionsResource extends BaseResource {
  /** Lists transactions. Await for one page, or `for await` to walk them all. */
  list(params: ListTransactionsParams = {}, options?: RequestOptions): PagePromise<Transaction> {
    return this.paginate<Transaction>('/v1/transactions', params as Record<string, unknown>, options);
  }

  retrieve(operationId: string | number, options?: RequestOptions): Promise<Transaction> {
    return this.http.request<Transaction>({
      method: 'GET',
      path: `/v1/transactions/${encodeURIComponent(String(operationId))}`,
      options,
    });
  }

  /** Every state change the transaction went through, oldest first. */
  timeline(operationId: string | number, options?: RequestOptions): Promise<TransactionTimelineEntry[]> {
    return this.http.request<TransactionTimelineEntry[]>({
      method: 'GET',
      path: `/v1/transactions/${encodeURIComponent(String(operationId))}/timeline`,
      options,
    });
  }

  /** The same filters as `list`, delivered as a CSV file. */
  exportCsv(params: ListTransactionsParams = {}, options?: RequestOptions): Promise<ChariPayFile> {
    return this.http.requestBinary({
      method: 'GET',
      path: '/v1/transactions/export.csv',
      query: params as Record<string, unknown>,
      options,
    });
  }
}
