// Pure-function tests for the Paystack helper: money conversion, the
// supported-currency guard, and — most important — webhook signature
// verification, which is the entire authentication of the webhook.
const crypto = require('crypto');

// Must be set before requiring the module reads it. paystack.js reads
// process.env at call time, so this is belt-and-braces.
process.env.PAYSTACK_SECRET_KEY = 'sk_test_unit';
const paystack = require('../../src/utils/paystack');

describe('minor-unit conversion', () => {
  it('converts major currency to whole minor units', () => {
    expect(paystack.toMinorUnits(12.5)).toBe(1250);
    expect(paystack.toMinorUnits(1)).toBe(100);
    expect(paystack.toMinorUnits(1000)).toBe(100000);
  });

  it('rounds to a whole minor unit (no fractional pesewas)', () => {
    expect(paystack.toMinorUnits(10.999)).toBe(1100);
  });

  it('rejects a non-positive or non-numeric amount', () => {
    expect(() => paystack.toMinorUnits(0)).toThrow();
    expect(() => paystack.toMinorUnits(-5)).toThrow();
    expect(() => paystack.toMinorUnits('abc')).toThrow();
  });

  it('round-trips back from minor units', () => {
    expect(paystack.fromMinorUnits(1250)).toBe(12.5);
  });
});

describe('currency guard', () => {
  it('accepts currencies Paystack can settle', () => {
    expect(paystack.currencySupported('GHS')).toBe(true);
    expect(paystack.currencySupported('ngn')).toBe(true);
    expect(paystack.currencySupported('USD')).toBe(true);
  });

  it('rejects currencies Paystack cannot settle', () => {
    expect(paystack.currencySupported('EUR')).toBe(false);
    expect(paystack.currencySupported('GBP')).toBe(false);
    expect(paystack.currencySupported('')).toBe(false);
  });
});

describe('webhook signature verification', () => {
  const secret = 'sk_test_unit';
  const sign = (body) => crypto.createHmac('sha512', secret).update(body).digest('hex');

  it('accepts a signature computed with the real secret over the exact body', () => {
    const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'LX-1' } }));
    expect(paystack.verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'LX-1' } }));
    const sig = sign(body);
    const tampered = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'LX-HACKED' } }));
    expect(paystack.verifyWebhookSignature(tampered, sig)).toBe(false);
  });

  it('rejects a wrong-key signature', () => {
    const body = Buffer.from('{"a":1}');
    const wrong = crypto.createHmac('sha512', 'sk_test_other').update(body).digest('hex');
    expect(paystack.verifyWebhookSignature(body, wrong)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(paystack.verifyWebhookSignature(Buffer.from('{}'), undefined)).toBe(false);
    expect(paystack.verifyWebhookSignature(Buffer.from('{}'), '')).toBe(false);
  });
});
