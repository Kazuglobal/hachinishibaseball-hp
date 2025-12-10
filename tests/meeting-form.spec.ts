import { test, expect } from '@playwright/test';

test.describe('総会出席フォーム', () => {
  test.beforeEach(async ({ page }) => {
    // ご支援のお願いページへ移動し、OB会参加セクションにスクロール
    await page.goto('/support#participation');
    // ページが完全にロードされるまで待機
    await page.waitForLoadState('networkidle');
  });

  test('フォームが正しく表示される', async ({ page }) => {
    // フォームの要素が表示されることを確認
    await expect(page.locator('h1')).toContainText('八戸西高等学校野球部OB会');
    await expect(page.getByText('2026年1月2日（金）に野球部OB会総会が開催されます')).toBeVisible();

    // フォームフィールドの存在を確認
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#period')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('input[name="attendance"][value="出席"]')).toBeVisible();
    await expect(page.locator('input[name="attendance"][value="欠席"]')).toBeVisible();
    await expect(page.locator('#remarks')).toBeVisible();
  });

  test('必須フィールドが空の場合、バリデーションエラーが表示される', async ({ page }) => {
    // 送信ボタンをクリック
    await page.click('button[type="submit"]');

    // エラーメッセージが表示されることを確認
    await expect(page.getByText('必須項目を入力してください。')).toBeVisible();
  });

  test('有効なデータで「出席」として送信できる', async ({ page }) => {
    // フォームに入力
    await page.fill('#name', 'テスト 太郎');
    await page.fill('#period', '10期');
    await page.fill('#email', 'test@example.com');
    await page.fill('#phone', '090-1234-5678');
    await page.check('input[name="attendance"][value="出席"]');
    await page.fill('#remarks', 'よろしくお願いします');

    // GAS API呼び出しをモック
    await page.route('**/script.google.com/macros/s/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: '送信されました' }),
      });
    });

    // 送信ボタンをクリック
    await page.click('button[type="submit"]');

    // 送信中のローディング表示を確認
    await expect(page.getByText('送信中...')).toBeVisible();

    // 成功メッセージが表示されることを確認
    await expect(page.getByText('ありがとうございました！')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('出欠のご回答を承りました。ご参加をお待ちしております。')).toBeVisible();

    // 「別の回答を送信する」ボタンが表示されることを確認
    await expect(page.getByText('別の回答を送信する')).toBeVisible();
  });

  test('有効なデータで「欠席」として送信できる', async ({ page }) => {
    // フォームに入力
    await page.fill('#name', 'テスト 花子');
    await page.fill('#period', '15期');
    await page.fill('#email', 'hanako@example.com');
    await page.check('input[name="attendance"][value="欠席"]');
    await page.fill('#remarks', '残念ながら参加できません');

    // GAS API呼び出しをモック
    await page.route('**/script.google.com/macros/s/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: '送信されました' }),
      });
    });

    // 送信ボタンをクリック
    await page.click('button[type="submit"]');

    // 成功メッセージが表示されることを確認
    await expect(page.getByText('ありがとうございました！')).toBeVisible({ timeout: 10000 });
  });

  test('電話番号なしでも送信できる', async ({ page }) => {
    // フォームに入力（電話番号は省略）
    await page.fill('#name', 'テスト 三郎');
    await page.fill('#period', '20期');
    await page.fill('#email', 'saburo@example.com');
    await page.check('input[name="attendance"][value="出席"]');

    // GAS API呼び出しをモック
    await page.route('**/script.google.com/macros/s/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: '送信されました' }),
      });
    });

    // 送信ボタンをクリック
    await page.click('button[type="submit"]');

    // 成功メッセージが表示されることを確認
    await expect(page.getByText('ありがとうございました！')).toBeVisible({ timeout: 10000 });
  });

  test('備考欄なしでも送信できる', async ({ page }) => {
    // フォームに入力（備考欄は省略）
    await page.fill('#name', 'テスト 四郎');
    await page.fill('#period', '25期');
    await page.fill('#email', 'shiro@example.com');
    await page.check('input[name="attendance"][value="欠席"]');

    // GAS API呼び出しをモック
    await page.route('**/script.google.com/macros/s/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: '送信されました' }),
      });
    });

    // 送信ボタンをクリック
    await page.click('button[type="submit"]');

    // 成功メッセージが表示されることを確認
    await expect(page.getByText('ありがとうございました！')).toBeVisible({ timeout: 10000 });
  });

  test('送信エラー時にエラーメッセージが表示される', async ({ page }) => {
    // フォームに入力
    await page.fill('#name', 'テスト エラー');
    await page.fill('#period', '30期');
    await page.fill('#email', 'error@example.com');

    // GAS API呼び出しをモックしてエラーを返す
    await page.route('**/script.google.com/macros/s/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'サーバーエラー' }),
      });
    });

    // 送信ボタンをクリック
    await page.click('button[type="submit"]');

    // エラーメッセージが表示されることを確認
    await expect(page.getByText('送信に失敗しました。しばらくしてから再度お試しください。')).toBeVisible({ timeout: 10000 });
  });

  test('「別の回答を送信する」ボタンでフォームがリセットされる', async ({ page }) => {
    // フォームに入力して送信
    await page.fill('#name', 'テスト リセット');
    await page.fill('#period', '35期');
    await page.fill('#email', 'reset@example.com');

    // GAS API呼び出しをモック
    await page.route('**/script.google.com/macros/s/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: '送信されました' }),
      });
    });

    await page.click('button[type="submit"]');

    // 成功メッセージが表示されるまで待機
    await expect(page.getByText('ありがとうございました！')).toBeVisible({ timeout: 10000 });

    // 「別の回答を送信する」ボタンをクリック
    await page.click('button:has-text("別の回答を送信する")');

    // フォームが再表示されることを確認
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('出欠を送信する');
  });

  test('メールアドレス形式が不正な場合、ブラウザのバリデーションが働く', async ({ page }) => {
    // フォームに入力（メールアドレスの形式が不正）
    await page.fill('#name', 'テスト バリデーション');
    await page.fill('#period', '40期');
    await page.fill('#email', 'invalid-email'); // 不正な形式

    // type="email"のHTML5バリデーションが働くか確認
    const emailInput = page.locator('#email');
    await emailInput.fill('invalid-email');

    // 送信ボタンをクリック
    await page.click('button[type="submit"]');

    // HTML5のバリデーションメッセージが表示されるか、
    // またはカスタムエラーメッセージが表示されることを確認
    // （ブラウザによってバリデーションの挙動が異なるため、フォームが送信されないことを確認）
    const isEmailValid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isEmailValid).toBe(false);
  });
});
