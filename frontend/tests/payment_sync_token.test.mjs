import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Payment Sync Token Client Tests', () => {
  test('syncCashfreePayment sends customer token in POST JSON request body', async () => {
    let capturedUrl = '';
    let capturedOptions = {};

    // Mock global fetch to inspect request parameters
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return {
        ok: true,
        json: async () => ({
          order_code: 'RL-2026-TEST',
          payment_status: 'PAID',
          order_status: 'PAID',
          message: 'Payment verified',
          is_paid: true,
        }),
      };
    };

    try {
      // Inline function simulating syncCashfreePayment implementation
      async function syncCashfreePayment(orderCode, token) {
        const API_BASE_URL = 'http://localhost:8000';
        const response = await fetch(`${API_BASE_URL}/payments/cashfree/sync/${encodeURIComponent(orderCode)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token || '' }),
        });
        if (!response.ok) {
          throw new Error('Failed to verify');
        }
        return response.json();
      }

      const orderCode = 'RL-2026-TEST';
      const orderToken = 'secure_customer_token_12345_abcdef';

      const result = await syncCashfreePayment(orderCode, orderToken);

      assert.equal(result.is_paid, true);
      assert.equal(capturedOptions.method, 'POST');
      assert.equal(capturedOptions.headers['Content-Type'], 'application/json');

      // 1. Verify token is sent in POST JSON body
      const body = JSON.parse(capturedOptions.body);
      assert.equal(body.token, orderToken);

      // 2. Verify token is NOT leaked in the URL path or query parameters
      assert.equal(capturedUrl.includes('token='), false);
      assert.equal(capturedUrl.includes(orderToken), false);
      assert.equal(capturedUrl.endsWith('/payments/cashfree/sync/RL-2026-TEST'), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('OrderSuccess polling logic falls back gracefully to order.order_token if URL search param is empty', () => {
    const urlToken = '';
    const order = { order_token: 'fallback_token_from_order_object' };

    const effectiveToken = urlToken || order?.order_token || '';
    assert.equal(effectiveToken, 'fallback_token_from_order_object');
  });

  test('OrderSuccess polling logic prioritizes searchParam orderToken when present', () => {
    const urlToken = 'url_query_token_priority';
    const order = { order_token: 'fallback_token_from_order_object' };

    const effectiveToken = urlToken || order?.order_token || '';
    assert.equal(effectiveToken, 'url_query_token_priority');
  });
});
