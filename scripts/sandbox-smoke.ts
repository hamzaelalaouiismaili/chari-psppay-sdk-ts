/**
 * Opt-in smoke test against the Chari Pay sandbox.
 *
 * Run with a sandbox key in the environment:
 *   CHARI_PAY_API_KEY=… npx tsx scripts/sandbox-smoke.ts
 *
 * `baseUrl` is set explicitly to SANDBOX_BASE_URL below (overridable via
 * CHARI_PAY_BASE_URL) rather than inferred from the key, since this script is
 * sandbox-only by definition and real sandbox keys aren't always shaped like
 * `chari_sk_test_…` (e.g. `flex_…`), which `resolveBaseUrl` doesn't recognise
 * and would otherwise reject. See docs/DECISIONS.md.
 *
 * It also reports which hand-modelled types in src/types/gaps.ts still need
 * verifying — the open question the design doc leaves for 1.0.0.
 */
import { ChariPay, SANDBOX_BASE_URL } from '../src/index.js';

const apiKey = process.env.CHARI_PAY_API_KEY;
if (!apiKey) {
  console.error('Set CHARI_PAY_API_KEY to a sandbox key first.');
  process.exit(1);
}

const chari = new ChariPay({ apiKey, baseUrl: process.env.CHARI_PAY_BASE_URL ?? SANDBOX_BASE_URL, debug: true });

async function main() {
  const balance = await chari.wallet.balance();
  console.log('wallet.balance →', JSON.stringify(balance));

  const link = await chari.paymentLinks.create({
    amount: 10,
    description: 'SDK smoke test',
  });
  console.log('paymentLinks.create →', link.reference);

  const page = await chari.transactions.list({ size: 3 });
  console.log('transactions.list →', page.content.length, 'items');
  console.log('SHAPE transactions:', JSON.stringify(page.content[0] ?? {}, null, 2));

  await chari.paymentLinks.cancel(link.reference!);
  console.log('paymentLinks.cancel → ok');
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
