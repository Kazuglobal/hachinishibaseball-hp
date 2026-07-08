import { test, expect } from '@playwright/test';

const GAS_ENDPOINT_PATTERN = 'https://script.google.com/macros/**/exec';

test('総会出欠フォームがモバイルで送信できること', async ({ page }) => {
  // GASへの送信をモックして成功レスポンスを返す
  await page.route(GAS_ENDPOINT_PATTERN, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.goto('/support#participation');

  await page.getByLabel('氏名').fill('テスト 太郎');
  await page.getByLabel('卒期').fill('10期');
  await page.getByLabel('メールアドレス').fill('test@example.com');
  await page.getByLabel('電話番号').fill('090-1234-5678');
  await page.getByLabel('備考・ご連絡事項').fill('モバイル送信の確認テストです。');

  await page.getByRole('button', { name: '出欠を送信する' }).click();

  await expect(page.getByRole('heading', { name: 'ありがとうございました！', exact: true })).toBeVisible();
});
