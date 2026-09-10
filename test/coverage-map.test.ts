import { describe, expect, it } from 'vitest';
import { ChariPay } from '../src/index.js';

/** Every namespace and the methods it must expose. 62 operations in total. */
const SURFACE: Record<string, string[]> = {
  wallet: ['balance', 'account', 'ribDocument', 'cashIn'],
  transactions: ['list', 'retrieve', 'timeline', 'exportCsv'],
  paymentLinks: ['create', 'list', 'retrieve', 'cancel', 'send', 'qr', 'poster'],
  checkoutSessions: ['create', 'list', 'retrieve', 'cancel'],
  checkout: ['verify', 'submit', 'confirmReturn', 'paymentStatus'],
  clients: ['create', 'list', 'retrieve', 'update', 'del', 'listPaymentMethods', 'setDefaultPaymentMethod', 'deletePaymentMethod'],
  products: ['create', 'list', 'retrieve', 'update', 'deactivate', 'orders'],
  subscriptions: ['create', 'list', 'retrieve', 'charges', 'pause', 'resume', 'cancel', 'selectPaymentMethod', 'testAutoPay'],
  refunds: ['create', 'list', 'retrieve'],
  analytics: ['journeySummary', 'journeyEvents'],
  webhookEndpoints: ['create', 'list', 'retrieve', 'update', 'del', 'activate', 'rotateSecret', 'sendTestEvent'],
  webhookEvents: ['list', 'retrieve', 'listTypes'],
};

describe('API coverage', () => {
  const chari = new ChariPay('chari_sk_test_EXAMPLE') as unknown as Record<string, Record<string, unknown>>;

  it('exposes all 62 operations', () => {
    const total = Object.values(SURFACE).reduce((n, methods) => n + methods.length, 0);
    expect(total).toBe(62);
  });

  for (const [namespace, methods] of Object.entries(SURFACE)) {
    it(`${namespace} exposes ${methods.length} methods`, () => {
      expect(chari[namespace], `chari.${namespace} is missing`).toBeDefined();
      for (const method of methods) {
        expect(typeof chari[namespace]![method], `chari.${namespace}.${method} is missing`).toBe('function');
      }
    });
  }

  it('exposes the webhooks namespace', () => {
    expect(typeof chari.webhooks!.constructEvent).toBe('function');
  });
});
