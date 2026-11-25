# Vercel → Cloudflare Pages 移行ガイド

本リポジトリは **Cloudflare Pages + Cloudflare Pages Functions** へそのままデプロイできる構成になっています。

## 構成の対応関係（Vercel → Cloudflare Pages）

| 項目 | Vercel（旧） | Cloudflare Pages（新） |
|---|---|---|
| 静的配信 | `dist/` | `dist/`（`wrangler.toml` で指定済み） |
| クリーンURL・SEO | `vercel.json` の `rewrites` | Cloudflare Pages が `dist/*.html`（`generate-canonical-shells.mjs` 生成）を自動配信＆未一致パスは `index.html` へ自動フォールバック |
| カスタムヘッダー | `vercel.json` の `headers` | `public/_headers`（ビルド時に `dist/_headers` へコピー） |
| Stripe決済API（年会費） | なし | `functions/api/*.js`（Cloudflare Pages Functions・Web Crypto API標準対応） |

---

## 移行手順（ゼロダウンタイム）

### Step 1: Cloudflare Pages プロジェクトを作成
1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) → **Workers & Pages → Create → Pages → Connect to Git**
2. GitHubリポジトリを選択
3. ビルド設定を入力：
   - **Framework preset**: `None`（または `Angular`）
   - **Build command**: `npm install --legacy-peer-deps && npm run build`
   - **Build output directory**: `dist`
4. **Environment variables（環境変数）** を追加：
   - `NODE_VERSION` = `22`
   - `STRIPE_SECRET_KEY` = `sk_live_...`（テスト時は `sk_test_...`）※暗号化（Secret）推奨
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`（Webhook作成後に設定）※暗号化（Secret）推奨
   - `GAS_WEB_APP_URL` = 省略可（未設定時はデフォルトURLを使用）
5. **Save and Deploy** をクリックし、`*.pages.dev` プレビューURLで表示と `/support` のミニチュアユニフォーム・決済動作を確認

### Step 2: Stripe Webhook と GAS の更新
1. Stripe ダッシュボード → **開発者 → Webhook → エンドポイントを追加**
2. エンドポイントURL: `https://hachinohenishibaseball.com/api/stripe-webhook`
3. イベント: `checkout.session.completed`
4. 発行された署名シークレット（`whsec_...`）を Cloudflare Pages の `STRIPE_WEBHOOK_SECRET` に保存して再デプロイ
5. `gas-unified-script.js` を Google Apps Script エディタに貼り付け、`authorizeAndTest` を1回実行してから「新しいバージョン」で再デプロイ

### Step 3: カスタムドメイン（`hachinohenishibaseball.com`）の切り替え（Vercel購入ドメイン）
1. Cloudflare ホーム → **Add a domain** → `hachinohenishibaseball.com` を追加し、発行されたネームサーバー2つ（`xxx.ns.cloudflare.com`）を確認
2. Vercel ダッシュボード（**Domains → `hachinohenishibaseball.com` → Nameservers**）でネームサーバーを Cloudflare の2つに変更
3. Cloudflare Pages プロジェクト → **Custom domains → Set up a custom domain** で `hachinohenishibaseball.com`（および必要なら `www.hachinohenishibaseball.com`）を追加（SSL証明書は自動発行されます）
4. 本番表示・Stripe決済・お問い合わせフォームを確認できたら、Vercel側のプロジェクトを停止・削除して完了です
   - ※ ドメイン更新管理まで完全に Cloudflare へ一本化したい場合は、切替後に Vercel Domains から Transfer Out（Auth Code取得）して Cloudflare Registrar へ移管できます。

---

## 補足：感謝ムービーの配置について
- `src/assets/videos/membership-thankyou.mp4` に動画ファイル（H.264 / 720p / 5〜15秒・10MB以下目安、上限25 MiB）を配置すると、会費納入完了時のモーダル背景で自動再生されます。
- 未配置の間はスタジアム・スポットライト＆紙吹雪のアニメーション背景が自動表示されます。

---

## ローカルでの動作確認（Cloudflare環境再現）
```bash
npm run build
npx wrangler pages dev dist
```
`.dev.vars` ファイル（`.gitignore` 対象）に `STRIPE_SECRET_KEY=sk_test_...` を書いておくと、ローカルでも Cloudflare Pages Functions と同じ環境で Stripe 決済まで通してテストできます。
