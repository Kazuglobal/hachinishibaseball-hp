/**
 * Cloudflare Pages Function: 協賛・広告枠 Stripe Checkout Session 検証 & GAS自動記録（審査待ち登録）
 * エンドポイント: GET /api/verify-sponsor-checkout?session_id=cs_...
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

async function recordSponsorToGas(record, env) {
  const gasUrl = env.GAS_WEB_APP_URL || DEFAULT_GAS_WEB_APP_URL;
  const formData = new URLSearchParams();
  formData.append('formType', 'sponsor_ad');
  formData.append('sessionId', record.sessionId);
  formData.append('tier', record.tier);
  formData.append('amount', String(record.amount));
  formData.append('companyName', record.companyName);
  formData.append('name', record.contactName);
  formData.append('email', record.email);
  formData.append('phone', record.phone || '');
  formData.append('url', record.url || '');
  formData.append('catchphrase', record.catchphrase || '');
  formData.append('timestamp', record.createdAt);

  try {
    await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
  } catch {
    // GAS書き込み失敗時でもWebhook側で再記録される
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const secretKey = resolveStripeSecretKey(request, env);

  if (!secretKey) {
    return json({ error: '現在オンライン決済の準備中です。' }, 503);
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
        headers: { Authorization: `Bearer ${secretKey}` },
      }
    );

    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      return json({ error: '決済情報の確認に失敗しました。' }, 502);
    }

    if (session.payment_status !== 'paid') {
      return json({ success: false, error: 'お支払いが完了していません。' }, 402);
    }

    const meta = session.metadata || {};
    const validTiers = ['bronze', 'silver', 'gold'];
    const tier = validTiers.includes(meta.tier) ? meta.tier : 'bronze';
    const defaultAmounts = { bronze: 10000, silver: 30000, gold: 50000 };

    const record = {
      sessionId: session.id,
      tier,
      amount: typeof session.amount_total === 'number' ? session.amount_total : defaultAmounts[tier],
      companyName: meta.companyName || '協賛企業様',
      contactName: meta.contactName || session.customer_details?.name || '',
      email: meta.email || session.customer_details?.email || '',
      phone: meta.phone || '',
      url: meta.url || '',
      catchphrase: meta.catchphrase || '',
      createdAt: session.created
        ? new Date(session.created * 1000).toISOString()
        : new Date().toISOString(),
    };

    await recordSponsorToGas(record, env);

    return json({
      success: true,
      application: {
        sessionId: record.sessionId,
        tier: record.tier,
        companyName: record.companyName,
        amount: record.amount,
      },
    });
  } catch {
    return json({ error: '検証中にエラーが発生しました。' }, 500);
  }
}
