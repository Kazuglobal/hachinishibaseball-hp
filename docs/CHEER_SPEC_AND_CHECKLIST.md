# 八戸西高校野球部OB会「現役応援 記念ボール寄付」詳細仕様書 ＆ 本番公開チェックリスト

対象ブランチ：`feature/cheer-tipping`  
対象URL：`/cheer`（関連導線：`/support`、ヘッダー、モバイルメニュー）

---

## 1. 目的と支援導線の優先順位

| 優先度 | 支援メニュー | 金額 | 役割・位置づけ |
|---|---|---|---|
| **第1優先（メイン）** | **OB会 年会費**（`/support#credit`） | 年間 5,000円 | OB会運営および現役支援の基盤。`/support` の最上部および `/cheer` の最上部で最優先案内を行う。 |
| **第2優先（少額補助）** | **現役応援 記念ボール寄付**（`/cheer`） | 1球 500円（上限 3球＝1,500円） | 年会費納入済みの方、または少額から気軽に現役選手の練習球を応援したい方向け。年会費と競合しないよう上限を3球（1,500円）に制限。 |

---

## 2. Stripe の設定について（500円用の商品登録は不要）

### 新たな「500円商品・価格（Product / Price / Buy Button）」の作成は **不要** です
`functions/api/create-checkout-session.js` が Stripe Checkout Sessions API へ `line_items[0][price_data]`（`currency: 'jpy'`, `unit_amount: 500`, `quantity: 1〜3`）を動的に送信する構成のため、**Stripe ダッシュボード上で500円用の商品や支払いリンクを個別に作成する必要はありません。**

### 本番稼働のために必要な Stripe / Cloudflare 設定（2点のみ）
1. **`STRIPE_SECRET_KEY`（必須）**
   - 既存の年会費決済と同じ Stripe アカウントのシークレットキー（テスト：`sk_test_...` ／ 本番：`sk_live_...`）を Cloudflare Pages の環境変数（Encrypted / Secret）へ登録。
2. **`STRIPE_WEBHOOK_SECRET`（推奨・取りこぼし防止）**
   - Stripe ダッシュボード → **開発者 → Webhook → エンドポイントを追加**
   - URL：`https://hachinohenishibaseball.com/api/stripe-webhook`
   - イベント：`checkout.session.completed`
   - 発行された `whsec_...` を Cloudflare Pages の環境変数へ登録。
   - ※ 決済完了直後にブラウザを閉じた場合でも、Webhook が HMAC-SHA256 署名検証の上で GAS（スプレッドシート）へ自動記録します。

---

## 3. 画面・デザイン・機能仕様

### 3.1 デザインルール
- **絵文字（Unicode Emoji）不使用**：画面テキスト・ボタン・ナビゲーションのすべてにおいて絵文字を使用しない。
- **過度なグラデーション・発光装飾不使用**：白背景（`#FFFFFF`）、オフホワイト（`#F8F8F7`）、八戸西ネイビー（`#002D62`）、アクセント赤（`#B31B1B`）、1px罫線、明朝見出し（`font-serif-jp`）を基調とする。

### 3.2 `/cheer`（記念ボール寄付ページ）構成
1. **年会費（5,000円）優先案内枠（最上部）**
   - 年会費納入が第一目的である旨を明記し、`/support#credit` へのボタンを配置。
2. **ヒーローセクション**
   - 左：説明文、リアルタイム応援球数・ご支援者数カウント。
   - 右：Blender 3D 60fps 記念ボール映像（`/assets/videos/hachinishi-ball.mp4`）を自動ループ再生（動画読込不可時は実物記念ボール表裏切替フォールバック）。
3. **ご支援内容入力フォーム ＋ 仕上がりプレビュー**
   - **お名前（必須・最大24文字）**：記念ボールに記載する表示名（ニックネーム可）。
   - **回期・立場（必須・最大16文字）**：自由入力＋プリセット（`OB・OG` / `保護者` / `一般支援者` / `10期` / `20期` / `30期` / `40期` / `48期`）。
   - **応援する球数（必須・1〜3球）**：`1球 ¥500` / `2球 ¥1,000` / `3球 ¥1,500` の3択のみ（5球・10球は廃止）。
   - **応援メッセージ（任意・最大120文字）**。
   - **決済ボタン**：「¥500 応援して記念ボールを受け取る」（ボタン表記に「Stripe」は含めない）。
   - **デモ体験ボタン**：「演出と記念ボール保存をデモ体験する（課金なし）」。
4. **入金完了・デモ体験モーダル（部員映像メイン構成）**
   - **メイン映像エリア（画面中央・高さ `56vh〜60vh`、`object-contain`、暗幕・重ね表示なし）**：
     - 現役部員の応援映像（`/assets/videos/cheer-practice.mp4`）を最優先でクリアに表示（音声ON/ミュート切替、ネイティブ操作バー付き）。
     - 上部ボタンで「3D記念ボール映像を見る」⇔「部員の映像に戻る」をいつでも切替可能。
   - **下部進呈バー（映像を遮らない専用エリア）**：
     - 記念ボール表裏サムネイル、シリアル番号（`HN-0001` 形式）、回期・氏名、応援メッセージを表示。
     - **「記念ボール画像を保存」ボタン**：HTML5 Canvas で 1080×1080 PNG（表裏両面＋お名前・回期・シリアル番号・メッセージ・発行日入り）を生成し即座にダウンロード。
5. **みんなの記念ボール一覧（`#cheer-wall`）**
   - 実データ（GAS 登録済み決済）が **0件の間のみ**、架空のサンプル3名（`山田 太郎（サンプル）` / `佐藤 花子（サンプル）` / `八戸 一郎（サンプル）`）を表示。
   - 実データが **1件以上** 登録されると、サンプル3名は自動で非表示となり実際の寄付者のみが表示される。

### 3.3 サイト内導線
- **ヘッダー（PC）** / **モバイルメニュー**：他メニューと同デザインの「記念ボール寄付」リンク（`/cheer`）。
- **`/support`（ご支援のお願い）**：最上部は年会費（5,000円）納入に集中させ、記念ボール寄付へのリンクは銀行振込セクションの下へ補助導線として配置。

---

## 4. システム・API・データ永続化仕様

| コンポーネント | パス | 役割 |
|---|---|---|
| フロントエンド画面 | `src/components/cheer-tipping/` | フォーム、プレビュー、部員メイン映像モーダル、Canvas PNG生成、一覧表示 |
| 状態・APIサービス | `src/services/cheer-tip.service.ts` | GAS取得、Checkout起動・検証、ローカルデモ管理（`localStorage`） |
| 決済セッション作成 | `functions/api/create-checkout-session.js` | `POST /api/create-checkout-session`（`unit_amount=500`, `quantity=1..3` サーバー側上限検証） |
| 決済検証＆GAS記録 | `functions/api/verify-checkout-session.js` | `GET /api/verify-checkout-session?session_id=...`（`payment_status==='paid'` 検証後に GAS へ記録） |
| Webhook受信 | `functions/api/stripe-webhook.js` | `POST /api/stripe-webhook`（Web Crypto HMAC-SHA256 署名検証、画面離脱時の取りこぼし防止） |
| スプレッドシート連携 | `gas-unified-script.js` | `formType=cheer_tip` で「現役応援投げ銭」シートへ `sessionId` 重複防止付き追記、`GET ?type=cheer_tips` で一覧配信 |
| 動画・画像素材 | `src/assets/videos/cheer-practice.mp4` / `hachinishi-ball.mp4`、`src/assets/images/hachinishi-ball-logo.png` / `hachinishi-ball-team.png` | 部員映像（5.3MB）、Blender 3D 60fps映像（6.1MB）、記念ボール表裏PNG |
| 4K 60fps 生成パイプライン | `colab/hachinishi_ball_blender_4k60.ipynb` | Google Colab（L4 GPU）で Blender 4.2.3 → ffmpeg 0.6s xfade → 60fps → RealESRGAN_x4plus 4K 出力 |

---

## 5. 本番公開前 抜け漏れ防止チェックリスト

### A. Stripe ＆ Cloudflare Pages 環境変数
- [ ] Cloudflare Pages（`hachinohenishibaseball` → Settings → Environment variables）に `STRIPE_SECRET_KEY`（Production：`sk_live_...`、Preview：`sk_test_...`）を **Secret（暗号化）** で登録した
- [ ] Stripe ダッシュボードで Webhook エンドポイント `https://hachinohenishibaseball.com/api/stripe-webhook`（イベント：`checkout.session.completed`）を作成した
- [ ] 発行された `whsec_...` を Cloudflare Pages の `STRIPE_WEBHOOK_SECRET` に登録した
- [ ] 変更後、環境変数を反映するため Cloudflare Pages を再デプロイした

### B. Google Apps Script（GAS）
- [ ] 既存 GAS プロジェクトのコードを最新の `gas-unified-script.js` で上書き保存した
- [ ] GAS エディタで `authorizeAndTest` を1回実行し、「現役応援投げ銭」シートの自動作成を確認した
- [ ] GAS を **「新しいバージョン」** で再デプロイした（アクセスできるユーザー：全員）
- [ ] ブラウザで `https://script.google.com/macros/s/.../exec?type=cheer_tips` を開き `{"success":true,"donations":[]}` が返ることを確認した

### C. テスト決済（Stripe テストモード `sk_test_...`）検証
- [ ] `/cheer` で球数選択肢が **1球（500円）・2球（1,000円）・3球（1,500円）のみ** であることを確認した
- [ ] テストカード（`4242 4242 4242 4242`）で 1球（¥500）決済を完了し、`/cheer?status=success&session_id=...` へ自動で戻ることを確認した
- [ ] 戻った直後に **部員の応援映像** が画面中央でクリアに自動再生されることを確認した
- [ ] 音声オン切替・3D記念ボール映像への切替が動作することを確認した
- [ ] 「記念ボール画像を保存」で 1080×1080 の PNG 画像（お名前・回期・シリアル番号・表裏ボール入り）がダウンロードできることを確認した
- [ ] スプレッドシート「現役応援投げ銭」に1行追記され、ページ再読み込みでも重複追加されないことを確認した
- [ ] テスト決済が1件入った時点で、サンプル3名（山田・佐藤・八戸）が一覧から自動で消え、実データのみ表示されることを確認した（※本番前にテスト行をシートから削除する）
- [ ] 決済キャンセル時に `/cheer?status=cancelled` に戻り、キャンセル通知が出ることを確認した

### D. UI・導線・レスポンシブ確認
- [ ] `/cheer` 最上部の「年会費（5,000円）の納入へ」ボタンから `/support#credit` へ正常遷移することを確認した
- [ ] `/support` で年会費（5,000円）が最優先表示され、記念ボール寄付案内は下部の補助枠に収まっていることを確認した
- [ ] PC（1280px以上）・タブレット・スマホ（375px）で崩れがなく、絵文字や不自然なグラデーションが残っていないことを確認した
- [ ] テスト確認後、デモ体験ボタンを本番公開時に残すか非表示にするか最終判断した（※本番公開時に不要であれば削除推奨）

### E. Git マージ・本番デプロイ
- [ ] `feature/cheer-tipping` の変更をコミット・プッシュし、PR レビュー後に `main` へマージした
- [ ] 本番ドメイン（`https://hachinohenishibaseball.com/cheer`）で最終疎通（SSL・動画再生・フォーム送信・SEO canonical）を確認した
