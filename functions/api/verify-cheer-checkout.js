/**
 * Cloudflare Pages Function: Stripe Checkout Session 検証 & GAS自動記録（記念ボール 500円寄付）
 * エンドポイント: GET /api/verify-cheer-checkout?session_id=cs_...
 */

const DEFAULT_GAS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbxXmo57vn3lWQLO6IqlcdOs_QC0L0i4PmGY-f5IwVhWWuRMz8RNbHsSzRWLTQJMyAgf/exec';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function resolveStripeSecretKey(request, env) {
  const host = new URL(request.url).hostname;
  const isPreview = host.endsWith('.pages.dev') || host === 'localhost' || host === '127.0.0.1';
  if (isPreview) {
    return env['STRIPE_SECRET_KEY-test'] || env.STRIPE_SECRET_KEY_TEST || env.STRIPE_SECRET_KEY;
  }
  return env.STRIPE_SECRET_KEY;
}

async function recordDonationToGas(donation, env) {
  const gasUrl = env.GAS_WEB_APP_URL || DEFAULT_GAS_WEB_APP_URL;
  const formData = new URLSearchParams();
  formData.append('formType', 'cheer_tip');
  formData.append('sessionId', donation.sessionId);
  formData.append('name', donation.name);
  formData.append('period', donation.period);
  formData.append('category', 'batting');
  formData.append('amount', String(donation.amount));
  formData.append('quantity', String(donation.quantity));
  formData.append('message', donation.message || '');
  formData.append('timestamp', donation.createdAt);

  try {
    await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
  } catch {
    // GAS書き込み失敗時でもStripe決済済みの演出・画面反映は継続する
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const secretKey = resolveStripeSecretKey(request, env);

  if (!secretKey) {
    return json({ error: 'STRIPE_SECRET_KEY が未設定です。' }, 503);
  }

  const url = new URL(request.url);
  const sessionId = String(url.searchParams.get('session_id') || '').trim();
  if (!sessionId || !/^cs_(test|live)_[A-Za-z0-9_]+$/.test(sessionId)) {
    return json({ error: '不正なセッションIDです。' }, 400);
  }

  try {
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      return json(
        { error: session?.error?.message || '決済情報の取得に失敗しました。' },
        502
      );
    }

    if (session.payment_status !== 'paid') {
      return json({ success: false, error: 'お支払いが完了していません。' }, 402);
    }

    const meta = session.metadata || {};
    const quantity = Math.min(Math.max(parseInt(meta.quantity, 10) || 1, 1), 3);

    const donation = {
      id: session.id,
      sessionId: session.id,
      name: meta.donorName || session.customer_details?.name || '匿名OB',
      period: meta.period || 'OB',
      category: 'batting',
      quantity,
      amount: typeof session.amount_total === 'number' ? session.amount_total : quantity * 500,
      message: meta.message || '',
      createdAt: session.created
        ? new Date(session.created * 1000).toISOString()
        : new Date().toISOString(),
    };

    await recordDonationToGas(donation, env);

    return json({
      success: true,
      donation,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : '検証中にエラーが発生しました。' },
      500
    );
  }
}
