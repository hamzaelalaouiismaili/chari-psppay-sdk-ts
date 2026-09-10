import { describe, expect, it } from 'vitest';
import type { components } from '../src/generated/api.js';

describe('codegen', () => {
  it('emits the payment link request schema', () => {
    const req: components['schemas']['CreatePaymentLinkRequest'] = {
      amount: 149.9,
      description: 'Order #1234',
    };
    expect(req.amount).toBe(149.9);
  });
});
