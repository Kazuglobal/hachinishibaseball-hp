/**
 * Cloudflare Pages Function: Stripe Checkout Session 検証 & GAS自動記録（OB会年会費）
 * エンドポイント: GET /api/verify-checkout-session?session_id=cs_...
 */

const DEFAULT_GAS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbxXmo57vn3lWQLO6IqlcdOs_QC0L0i4PmGY-f5IwVhWWuRMz8RNbHsSzRWLTQJMyAgf/exec';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function recordMembershipToGas(record, env) {
  const gasUrl = env.GAS_WEB_APP_URL || DEFAULT_GAS_WEB_APP_URL;
  const formData = new URLSearchParams();
  formData.append('formType', 'membership_fee');
  formData.append('sessionId', record.sessionId);
  formData.append('name', record.name);
  formData.append('period', record.period);
  formData.append('year', String(record.year || new Date().getFullYear()));
  formData.append('amount', String(record.amount));
  formData.append('message', record.message || '');
  formData.append('timestamp', record.createdAt);

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
  const secretKey = env.STRIPE_SECRET_KEY;

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
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent.latest_charge`,
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
        { error: session?.error?.message || 'Stripe決済情報の取得に失敗しました。' },
        502
      );
    }

    if (session.payment_status !== 'paid') {
      return json({ success: false, error: 'お支払いが完了していません。' }, 402);
    }

    const rawReceiptUrl = session?.payment_intent?.latest_charge?.receipt_url;
    const receiptUrl =
      typeof rawReceiptUrl === 'string' && rawReceiptUrl.startsWith('https://pay.stripe.com/')
        ? rawReceiptUrl
        : '';

    const meta = session.metadata || {};
    const parsedYear = parseInt(meta.year, 10);
    const year = Number.isInteger(parsedYear) ? parsedYear : new Date().getFullYear();

    const donation = {
      id: session.id,
      sessionId: session.id,
      name: meta.donorName || session.customer_details?.name || '匿名OB',
      period: meta.period || 'OB',
      category: 'membership_fee',
      year,
      quantity: 1,
      amount: typeof session.amount_total === 'number' ? session.amount_total : 5000,
      message: meta.message || '',
      receiptUrl,
      createdAt: session.created
        ? new Date(session.created * 1000).toISOString()
        : new Date().toISOString(),
    };

    await recordMembershipToGas(donation, env);

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
