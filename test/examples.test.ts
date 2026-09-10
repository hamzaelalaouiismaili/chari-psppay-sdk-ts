import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

describe('README', () => {
  it('never contains a real-looking credential', () => {
    // Any key or secret in the docs must be an obvious placeholder.
    const suspicious = README.match(/chari_sk_(test|live)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9_-]{8,}/g) ?? [];
    for (const match of suspicious) expect(match).toMatch(/EXAMPLE/);
  });

  it('documents every namespace', () => {
    for (const ns of [
      'wallet', 'transactions', 'paymentLinks', 'checkoutSessions', 'checkout',
      'clients', 'products', 'subscriptions', 'refunds', 'analytics',
      'webhookEndpoints', 'webhookEvents', 'webhooks',
    ]) {
      expect(README).toContain(`chari.${ns}`);
    }
  });

  it('warns that the checkout namespace is public', () => {
    expect(README.toLowerCase()).toContain('no api key');
  });
});
