/**
 * Cloudflare Pages Function: Stripe Webhook (checkout.session.completed)
 * エンドポイント: POST /api/stripe-webhook
 *
 * Web Crypto API (crypto.subtle) を使用し、Cloudflare Workers/Pages 標準ランタイムで動作します。
 * 必要な環境変数:
 *   STRIPE_WEBHOOK_SECRET : Stripe Webhook署名シークレット（whsec_...）
 *   GAS_WEB_APP_URL       : 省略時はデフォルトのGAS URLを使用
 */

const DEFAULT_GAS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbxXmo57vn3lWQLO6IqlcdOs_QC0L0i4PmGY-f5IwVhWWuRMz8RNbHsSzRWLTQJMyAgf/exec';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));
  if (Number.isNaN(ageSeconds) || ageSeconds > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${rawBody}`)
  );

  const expectedHex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqualHex(signature.toLowerCase(), expectedHex);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return json({ error: 'STRIPE_WEBHOOK_SECRET が未設定です。' }, 503);
  }

  try {
    const rawBody = await request.text();
    const sigHeader = request.headers.get('stripe-signature');
    const isValid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
    if (!isValid) {
      return json({ error: 'Invalid Stripe signature' }, 400);
    }

    const event = JSON.parse(rawBody);
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object;
      if (
        session &&
        session.payment_status === 'paid' &&
        (session.metadata?.paymentType === 'membership_fee' ||
          session.metadata?.category === 'membership_fee')
      ) {
        const meta = session.metadata;
        const gasUrl = env.GAS_WEB_APP_URL || DEFAULT_GAS_WEB_APP_URL;
        const formData = new URLSearchParams();
        formData.append('formType', 'membership_fee');
        formData.append('sessionId', session.id);
        formData.append('name', meta.donorName || session.customer_details?.name || '匿名OB');
        formData.append('period', meta.period || 'OB');
        formData.append('year', String(meta.year || new Date().getFullYear()));
        formData.append('amount', String(session.amount_total || 5000));
        formData.append('message', meta.message || '');
        formData.append(
          'timestamp',
          session.created
            ? new Date(session.created * 1000).toISOString()
            : new Date().toISOString()
        );

        await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });
      }
    }

    return json({ received: true });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Webhook処理中にエラーが発生しました。' },
      500
    );
  }
}
