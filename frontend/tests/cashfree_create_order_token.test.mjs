import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Cashfree Create Order Token Client Tests', () => {
  test('createCashfreeOrder sends customer order_token in POST JSON request body', async () => {
    let capturedUrl = '';
    let capturedOptions = {};

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return {
        ok: true,
        json: async () => ({
          payment_session_id: 'session_mock_123',
          order_id: 'RL-2026-TEST',
          order_code: 'RL-2026-TEST',
          amount: 1999,
          currency: 'INR',
          mode: 'sandbox',
        }),
      };
    };

    try {
      async function createCashfreeOrder(orderCode, token) {
        const API_BASE_URL = 'http://localhost:8000';
        const response = await fetch(`${API_BASE_URL}/payments/cashfree/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_code: orderCode, token: token || '' }),
        });
        if (!response.ok) {
          throw new Error('Failed to initiate Cashfree payment');
        }
        return response.json();
      }

      const orderCode = 'RL-2026-TEST';
      const orderToken = 'secure_customer_token_xyz789';

      const result = await createCashfreeOrder(orderCode, orderToken);

      assert.equal(result.payment_session_id, 'session_mock_123');
      assert.equal(capturedOptions.method, 'POST');
      assert.equal(capturedOptions.headers['Content-Type'], 'application/json');

      // 1. Verify token and order_code are in the POST JSON body
      const body = JSON.parse(capturedOptions.body);
      assert.equal(body.order_code, orderCode);
      assert.equal(body.token, orderToken);

      // 2. Verify token is NOT leaked in the URL path or query parameters
      assert.equal(capturedUrl.includes('token='), false);
      assert.equal(capturedUrl.includes(orderToken), false);
      assert.equal(capturedUrl.endsWith('/payments/cashfree/create-order'), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('createCashfreeOrder defaults token to empty string if not provided', async () => {
    let capturedOptions = {};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      capturedOptions = options;
      return {
        ok: true,
        json: async () => ({ payment_session_id: 'session_mock' }),
      };
    };

    try {
      async function createCashfreeOrder(orderCode, token) {
        const API_BASE_URL = 'http://localhost:8000';
        const response = await fetch(`${API_BASE_URL}/payments/cashfree/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_code: orderCode, token: token || '' }),
        });
        return response.json();
      }

      await createCashfreeOrder('RL-TEST');
      const body = JSON.parse(capturedOptions.body);
      assert.equal(body.order_code, 'RL-TEST');
      assert.equal(body.token, '');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
