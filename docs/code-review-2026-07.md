# コードレビュー監査レポート（2026-07-05）

## 対応状況（2026-07-08 追記）

指摘36件のうち35件を修正済み。#16（ダミー画像の差し替え）のみユーザー判断によりスキップ。
本番ビルド（`strict: true` + `strictTemplates: true`、警告0件）・Playwright E2E全10件・
実ブラウザでのルート/フォーム/ゲーム動作確認まで完了。

| # | 状態 | 対応内容 |
|---|---|---|
| 1 | ✅ 修正 | `withHashLocation()` を撤去しpathベースルーティングに変更。ヘッダー実測で `/about`・`/support` 等が実URLで正しく表示されることを実証 |
| 2 | ✅ 修正 | catch-flyの着地判定を再設計。着地目標Yを`playerY-30`基準の分布に変更し、影・着地目標も`ball.y`追従に統一。シミュレーションでY軸単体キャッチ率70%を確認 |
| 3 | ✅ 修正 | 5秒フォールバック・GIFエラー時タイマーをID管理し`ngOnDestroy`でクリア。destroy時に`enableBodyScroll(true)`も追加。scrollY退避・復元も実装（#30と統合） |
| 4-5 | ✅ 修正 | `isAnimating`フラグでrAFループの多重起動を防止。`nextPitch()`は初回のみループ起動。結果表示の2段`setTimeout`をID管理しdestroyでクリア |
| 6 | ✅ 修正 | プレースホルダーGA4スクリプトを削除（実測定ID未定のため） |
| 7 | ✅ 修正 | Tailwindをangular.jsonの`styles`経由でビルド統合。CDN script・importmap・console握りつぶしパッチ・旧`index.css`を全削除。d3もnpm化しバンドル |
| 8 | ✅ 修正 | support.component.tsのハードコードGAS URLを削除し`environment.gasWebAppUrl`に統一（ユーザー確認済み） |
| 9 | ✅ 修正 | `@ViewChild`をsignalベースの`viewChild()`+`effect()`に変更。resizeリスナーも named関数化して`ngOnDestroy`で解除。実ブラウザでバー28件描画を確認 |
| 10 | ✅ 修正 | participation-form.spec.tsの3重複を解消。ロケータの曖昧性（strict mode violation）・ローディング表示のタイミング起因の不安定性も修正し、全10件パス |
| 11-24 | ✅ 修正 | contact二重読み・support購読リーク・カルーセルタイマーリーク・iframeメモ化・href="#"リンク・alumni-voiceエラー処理/XSSエスケープ・side-ui pointer-events・ゲーム二重起動ガード・homerunコンボリセット/スペースキー・GAS無害化（3スクリプト共通）・パンくずオフセット、全て修正し実測で確認 |
| 25-36 | ✅ 修正 | optimalPowerクランプ、game-scoreバリデーション+保存済み判定改善、構造化データクリーンアップ+uploadDate修正、scrollService更新、カルーセルオフセット計算修正、d3バンドル化、二重購読解消、console握りつぶし削除（#7と統合）、未使用インポート・GameResultComponent・tsconfig残骸等のデッドコード削除、`tsconfig.json`に`strict`+`strictTemplates`を有効化（型/テンプレートエラー計12件を修正、うち2件はNgOptimizedImageの`priority`+`loading`競合という実行時エラーの発見・修正を伴った） |
| 35 | ⏭ 見送り | 活動報告データの3ファイル重複は、実際には全17件のIDが完全一致し、`works.component`は`additionalImages`を描画しないため実害なし（当初报告の「食い違い」は誤検知）と確認。JSON集約への大規模リファクタは高リスク・低実益と判断し見送り |
| 16 | ⏭ 見送り | picsum.photosダミー画像の差し替えはユーザー判断でスキップ |



対象: リポジトリ全体（Angular 20 SPA / GAS連携 / Stripe / Playwright E2E / Vercel）
手法: 全ソース読解 + 本番ビルド実行 + ヘッドレスブラウザでのルーティング実証 + E2Eテスト実行

## リポジトリ構造の要約

- **スタック**: Angular 20（standalone / zoneless change detection / OnPush / **ハッシュルーティング** `withHashLocation`）、Tailwind CSS、Playwright、Vercel。Google AI Studio 生成プロジェクトが起源（`index.tsx` エントリ、`tsconfig.json` に `jsx: react-jsx` が残存）。
- **構成**: `src/components/`（一般ページ19 + ミニゲーム3）、`src/services/`（seo / scroll / menu / game-score / alumni-voice）、`src/directives/`（tilt / observe-visibility）。記事データは `src/assets/data/alumni-voices.json` と各コンポーネント内ハードコードの2系統。
- **外部連携**: お問い合わせ・OB会出欠フォーム → Google Apps Script Web App（POST）、会費決済 → Stripe Buy Button、GA4、Tailwind / D3 は CDN 読み込み。
- **データフロー**: 静的データ中心。フォームのみが外部書き込み（GAS → スプレッドシート + 通知メール）。ゲームスコアは localStorage。

## 検出結果一覧（重要度順）

| # | 重要度 | ファイル:行 | 種別 | 症状・何が起きるか | 原因 | 修正方針 |
|---|---|---|---|---|---|---|
| 1 | **Critical** | `index.tsx:22` / `public/sitemap.xml` / `public/robots.txt` / `src/services/seo.service.ts` 各所 / `tests/*.spec.ts` | ルーティング/SEO | **実証済み**: `/about` や `/support#participation` へ直アクセスすると `#/`（ホーム）に落ちる。sitemap の全17 URL・canonical・og:url・robots の Allow・E2E テストの遷移先が全て機能していない。SEO 施策（構造化データ、canonical 等の投資）がほぼ無効 | `withHashLocation()`（実 URL は `/#/about`）なのに、サイト全体がパス形式 URL（`/about`）前提で書かれている。`vercel.json` には既に SPA rewrite があるため hash locationにする必然性がない | `withHashLocation()` を外して PathLocationStrategy に統一（rewrite 設定済みなので移行は小さい）。または全 URL 参照を `/#/` 形式に統一（非推奨） |
| 2 | **Critical** | `src/components/game-center/games/catch-fly/catch-fly.component.ts:484-493` | 論理バグ | フライキャッチゲームがデスクトップでは**ほぼ全球 MISS 判定**になり実質プレイ不能 | 着地判定 `dy = |ball.y - (playerY-30)| < 50` が物理座標 `ball.y`（着地時 25〜270px）と画面座標 `playerY = canvasHeight-50`（デスクトップで約540px）を混同。描画は `visualY = ball.y - z*2`（:877）で別座標系 | 判定を x 距離のみにするか、落下地点表示 `drawLandingTarget` と同じ座標系（`canvasHeight-40` 基準）で判定する |
| 3 | **Critical** | `src/components/hero/hero.component.ts:40-52, 157-162, 165-173` | タイマーリーク | ホーム表示から5秒以内に別ページへ遷移すると、破棄済みコンポーネントで `enableBodyScroll(false)` が実行され `body` が `overflow:hidden; position:fixed` に。ポップアップは描画されないため解除手段がなく**サイト全体のスクロールが永久ロック** | `ngOnInit` の5秒フォールバック `setTimeout` の ID を保持しておらず、`ngOnDestroy` は `gifTimeout`/`popupTimeout` しかクリアしない。`onGifError` 内 `setTimeout`(:184-197) も同様 | タイマー ID をフィールドに保持し `ngOnDestroy` でクリア。`ngOnDestroy` で `enableBodyScroll(true)` も呼ぶ |
| 4 | **High** | `src/components/game-center/games/strike-pitching/strike-pitching.component.ts:395, 398-412, 726-733` | 二重実行/リーク | 投球ごとに rAF ループが1本ずつ増殖（2球目で2本…6球目で6本）。`throwProgress += 0.04` が本数分加算され**球速が投球ごとに倍増**。`animationId` が上書きされるため `ngOnDestroy` は最後の1本しか止められず、ゲーム中に離脱すると残りが永久実行 | `animateGame()` は `result`/`selecting` 状態でも自己継続するのに、`nextPitch()` が無条件で `animateGame()` を再起動 | `nextPitch()` での再起動をやめる（ループは1本を維持）か、起動前に `cancelAnimationFrame(this.animationId)` |
| 5 | **High** | `strike-pitching.component.ts:726-733` | タイマーリーク | 結果表示中（最長2.3秒）に画面離脱すると、破棄後に `nextPitch()` が実行され**破棄済みコンポーネント上で rAF 無限ループが復活**（`selecting` 状態は停止条件を満たさない） | `setTimeout` 2段のIDを保持せず `ngOnDestroy` でクリアしていない（homerun側は `flyingTimeoutId` 等で対策済み、こちらだけ漏れ） | homerun と同様にタイマー ID を保持して destroy 時にクリア + `nextPitch()` 冒頭に destroyed ガード |
| 6 | **High** | `index.html:10-19` | 設定不備 | GA4 の測定 ID がプレースホルダー `G-XXXXXXXXXX` のまま本番ビルドに含まれる（**アクセス解析が一切動いていない**。ビルド成果物で確認済み） | 実 ID 未設定のままリリース | 実測定 ID を設定。不要なら script ごと削除 |
| 7 | **High** | `index.html:256, 343-359` / `angular.json`（styles 未定義） / ルート `index.css` | ビルド構成 | 本番のスタイルが **Tailwind Play CDN（本番利用非推奨）に全面依存**。CDN 障害・遅延でレイアウト全壊、毎回ランタイムでクラス生成（FOUC / パフォーマンス）。ルート `index.css` の `@tailwind` ディレクティブはビルドされないデッドファイル。`aistudiocdn.com` / `esm.sh` への importmap も残存（バンドル済みのため未使用の外部依存） | AI Studio 由来の CDN 構成のまま、`tailwindcss` を devDependencies に入れただけでビルドパイプライン（PostCSS）未接続 | `@angular/build` の styles に Tailwind をビルド接続し、CDN script と importmap を削除 |
| 8 | **High（要確認）** | `src/components/support/support.component.ts:86` vs `src/environments/environment*.ts:12` | 構成ドリフト | OB会出欠フォームの送信先 GAS URL（`AKfycbwrFlZn...`）が、環境設定・お問い合わせフォームの URL（`AKfycbzyCDim...`）と**別のデプロイをハードコード**。片方が旧デプロイなら**出欠回答が黙って失われる** | `environment.gasWebAppUrl` を使わず直書き。コメントに「実際のURLに置き換えてください」が残存 | どちらのデプロイが正か確認の上、`environment` に一本化 |
| 9 | **High** | `src/components/about/about.component.ts:18, 116-125` / `about.component.html:35-36` | 論理バグ/リーク | 「出身中学校」の**棒グラフが一切描画されない**。`ngAfterViewInit` と resize 毎に TypeError。加えて resize リスナーが匿名関数で解除不能（OnDestroy 自体なし）、/about 訪問ごとに蓄積 | `@ViewChild({static: true})` は `*ngIf` 内要素を解決できず永久に undefined。また表⇔グラフ切替時の再描画ロジックも無い | `static: false` + `viewMode` 変更時に effect で描画。リスナーは named 関数 + `ngOnDestroy` で解除 |
| 10 | **High** | `tests/participation-form.spec.ts:1-29`（3重複） / `tests/meeting-form.spec.ts` 全ケース | テスト | **E2E テストが1件も機能していない**。participation-form は同一コードが3回重複貼り付けされ `GAS_ENDPOINT_PATTERN` 再宣言で SyntaxError（実行時に「No tests found」を確認）。meeting-form は `/support#participation` へ遷移するが #1 の通りホームが表示されるため全9ケース失敗 | コピペ事故 + ハッシュルーティング導入時にテスト未更新 | 重複を削除し、遷移先を `/#/support#participation` 相当に修正（#1 の方針決定後に） |
| 11 | **Medium** | `src/components/contact/contact.component.ts:105-114` | エラー処理バグ | GAS 応答の JSON パース失敗時、フォールバックの `response.text()` が「body stream already read」で必ず TypeError → 意図したデバッグ情報が得られない | `response.json()` で消費済みのボディを再読しようとしている | 先に `response.text()` で受けて `JSON.parse` する（下記パッチ参照） |
| 12 | **Medium** | `src/components/support/support.component.ts:97-104` | 購読リーク | `/support` を訪れるたびに `router.events` の購読が積み増しされ、破棄後も全ナビゲーションで `scrollToFragment()` が実行され続ける。AppComponent（`app.component.ts:48-76`）と機能も二重 | 完了しないストリームを unsubscribe せず、OnDestroy 未実装 | `takeUntilDestroyed()` を使う。そもそも AppComponent 側と統一して削除を検討 |
| 13 | **Medium** | `src/components/works/works.component.ts:219-224, 260-287` / `alumni-activities.component.ts:323-328, 369-374` | タイマーリーク | カルーセル操作の3秒後に自動スライドを再開する `setTimeout` が destroy 後に発火すると、新しい `setInterval` が生成され**二度と解除されない**（4秒毎に永久実行） | `setTimeout(() => this.startAutoSlide(), 3000)` の ID 未管理 | タイムアウト ID を保持し `ngOnDestroy` でクリア、または `startAutoSlide` に destroyed ガード |
| 14 | **Medium** | `src/components/alumni-activities/alumni-activities.component.ts:484-527` / `.html:177, 227` | パフォーマンス | 変更検知のたびに `bypassSecurityTrustResourceUrl` が新オブジェクトを返し、YouTube iframe（デスクトップ7本）の `[src]` が更新→**再生中でもリロードされる** | SafeResourceUrl の毎回生成（参照比較で毎回「変更あり」） | URL→SafeResourceUrl を Map でメモ化、または computed 化 |
| 15 | **Medium** | `footer.component.html:12,34,52,64` / `alumni-activities.component.html:540-544` / `header.component.html:29` / `menu.component.html:55` | ルーティング | `href="#"` のリンクをクリックすると、ハッシュルーティング下では**閲覧中ページから突然ホームへ遷移**。特に alumni-activities の「掲載を希望される方はこちら」は問い合わせ導線として機能していない | hash location では `#` クリック＝ルート `''` への遷移 | ダミーは `<button>`/`<span>` に、導線は `routerLink="/contact"` に修正 |
| 16 | **Medium** | `src/components/home/home.component.html:14,17` / `owners-voice.component.ts:39` | 品質/外部依存 | 本番トップページの会長挨拶背景などが `picsum.photos` の**ランダムなダミー写真**。表示のたびに無関係な画像、外部サービス停止で欠落 | プレースホルダーの置き換え忘れ | 実画像を `assets` に配置して差し替え |
| 17 | **Medium** | `src/services/alumni-voice.service.ts:43-55` / `alumni-voice-detail.component.ts:55-71` | エラー処理 | `alumni-voices.json` の取得失敗（404/ネットワーク断）時、`response.ok` 未チェックのまま空配列で「ロード完了」となり、詳細ページは**エラー表示なしで黙ってホームへリダイレクト**（記事が消えたように見える） | fetch のステータス未検証 + 失敗状態とデータ0件の区別なし | `response.ok` チェック + エラー状態のシグナル化、リトライまたはエラーメッセージ表示 |
| 18 | **Medium** | `src/components/alumni-voice-detail/alumni-voice-detail.component.ts:86-144` / `.html:59` | セキュリティ（潜在） | 記事本文を文字列連結で HTML 化し `bypassSecurityTrustHtml` に投入。キャプションが `alt="${captionText}"` に未エスケープで挿入されるため、データ源が CMS/寄稿に変わった瞬間 stored XSS になる構造。また `getFormattedContent()` がテンプレートから毎変更検知で呼ばれ正規表現処理が再実行される | サニタイズの完全バイパス + メモ化なし | 挿入値の HTML エスケープ関数を挟む。結果は `computed()` にキャッシュ |
| 19 | **Medium** | `src/components/side-ui/side-ui.component.html:10-16` | UI バグ | ページ上部ではフローティング CTA が `opacity-0` で不可視のまま**クリック判定だけ残り**（w-24 h-24）、下のコンテンツのタップを奪う | `pointer-events-none` の付与漏れ | 非表示時に `pointer-events-none` を併用 |
| 20 | **Medium** | `catch-fly.component.ts:320-339` ほか3ゲームの `startGame()` | 二重実行 | START 連打（zoneless + OnPush ではボタン除去が非同期）で、ゲームループ・スポーン interval・タイマーが二重起動。catch-fly は旧 interval の ID が上書きされ**解除不能**（時間が2倍速で減り、破棄後も残留） | 再入ガードなし | 冒頭に `if (this.gameState() === 'playing') return;` を追加（3ゲーム共通） |
| 21 | **Medium** | `homerun-challenge.component.ts:340-348, 643-656` | 論理バグ | 「もう一度」で新ゲームを始めると前ゲーム末尾のコンボ数を引き継ぎ、**1打目からスコア倍率が不正に高い** | `startGame()` が `comboCount`/`lastHitType` をリセットしない | `startGame()` でリセット |
| 22 | **Medium** | `homerun-challenge.component.ts:208-214` | UI バグ | ゲームオーバー画面のニックネーム入力で**スペースが入力できない**（window レベルで無条件 preventDefault） | 入力フォーカス・ゲーム状態を見ずに Space を横取り | catch-fly 同様 `gameState() !== 'playing'` なら return |
| 23 | **Medium** | `gas-contact-script.js:207-214, 251-257` / `コード.gs:71-100, 117` | セキュリティ/GAS | ①スプレッドシートへ**未サニタイズで appendRow**（`=` 始まりの本文で数式インジェクション可能）②例外時 `error.toString()` をそのままクライアントへ返却（内部情報漏えい）③`コード.gs` はスタンドアロン実行だと `getActiveSpreadsheet()` 失敗のたびに**新規スプレッドシートを作成**し回答が分散する可能性（要確認）④通知先 Gmail アドレスのハードコード | GAS 側の入力・出力処理が未整備。新旧スクリプト3種（+空の `gas-script.js`）が併存しどれがデプロイ実体か不明 | 書き込み前に `'` プレフィックス等で無害化、エラーは固定文言に、SPREADSHEET_ID 方式（contact 版）に統一、旧スクリプトを削除 |
| 24 | **Medium（要確認）** | `src/app.component.html:6` / `header.component.html:1-2` | UI | パンくずは文書最上部に描画されるが、ヘッダーが `fixed top-0 h-20` のため**80px の下敷きになり視認できない**可能性が高い | 固定ヘッダー分のオフセット未確保 | 実表示確認の上、`pt-20` 等を付与 |
| 25 | **Low** | `strike-pitching.component.ts:390-392, 1098` | 論理バグ | 6球目は `optimalPower` が最大102となり、パワーゲージ(0-100)の最適ゾーンマーカーが枠外に描画され狙えない | `50 + floor(random * (35 + n*3))` が 100 超え得る | `Math.min(100 - 幅, ...)` でクランプ |
| 26 | **Low** | `src/services/game-score.service.ts:42-44, 76-86` | 堅牢性/UX | ①localStorage の JSON を形状検証なしで信頼（旧形式・破損データでキー欠落→ランキング表示が落ち得る）②6位以下のスコアは `addScore` が 0 を返し、保存フォームが「保存済み」にならず何度でも押せる | パース後のバリデーションなし / ランク外の扱いが UI と不整合 | スキーマ検証 + ランク外時も「保存済み（ランク外）」表示に |
| 27 | **Low** | `src/services/seo.service.ts:122-137, 284-290` / `alumni-activities.component.ts:262` | SEO | ①`removeStructuredData()` がどこからも呼ばれず、構造化データ未設定ページへ遷移すると**前ページの JSON-LD が残留**②動画の `uploadDate` に閲覧時刻 `new Date().toISOString()` を出力（不正確なメタデータ） | ライフサイクル連動なし / 実アップロード日未管理 | ルート遷移時にクリーンアップ、uploadDate はデータ側に持たせる |
| 28 | **Low** | `src/services/scroll.service.ts:34-38` | 論理バグ | スクロール進捗バーの分母 `documentHeight` が初期化と resize 時しか更新されず、ページ遷移・画像ロード後に進捗が不正確 | ルート遷移・DOM 変化で `updateValues()` を呼んでいない | NavigationEnd 購読か ResizeObserver(document.body) で更新 |
| 29 | **Low** | `alumni-activities.component.ts:73, 83-88` | 論理バグ | モバイルカルーセル最終ページで右側に空白（`-4 * 100/1.2% = -333%` は有効最大オフセット約316%を超過） | `cardsPerView=1.2` の端数を考慮しないオフセット計算 | `Math.min` で最大オフセットをクランプ |
| 30 | **Low** | `hero.component.ts:157-162` | UI | ポップアップ表示時 `position:fixed` にする際スクロール位置を退避せず、閉じた後にページ先頭へ飛ぶ | `top: -scrollY` の保存・復元なし | 定石どおり scrollY を退避・復元 |
| 31 | **Low（要確認）** | `index.html:257` / `about.component.ts:137` | 外部依存/レース | D3 を defer CDN 読み込みしており、CDN 遅延・ブロック環境で /about 初期化時に `d3 is not defined` になり得る | グローバル CDN 依存（npm バンドルでない） | `npm i d3` してバンドルに含める |
| 32 | **Low** | `alumni-voice-detail.component.ts:36-50` | 二重実行 | データロード済みで遷移した場合、constructor の effect と ngOnInit の両方が `loadVoiceFromRoute()` を呼び `route.params` を二重購読（route 完了で解放されるため実害は二重実行のみ） | 初期化経路の重複 | effect 側に一本化 |
| 33 | **Low** | `index.html:226-253` | コード品質 | `console.warn`/`console.error` をモンキーパッチして Tailwind CDN 警告・YouTube CORS エラーを握りつぶし。条件が緩く（"youtube.com" を含む CORS エラー全部）本物の障害も隠れる | 根本原因（CDN 利用）への対症療法 | #7 の対応で警告自体を消し、パッチを削除 |
| 34 | **Low** | ビルド警告4件（`alumni-activities.component.ts:52`、`alumni-voice-detail.component.ts:14`、`works.component.ts:10`）ほか | デッドコード | 未使用インポート（NG8113 警告）、`GameResultComponent` 未使用、`missDirection`・`RESULT_DISPLAY_DURATION` 未配線、`home.component.ts:60-64` の未使用シグナル、`donors2025=[]`、`gas-script.js`（0バイト）、ルート `index.css`、`alumni_voice_card.html`/`alumni_voice_slide.html`、`index.tsx` の何もしない `localImageLoader`、`tsconfig.json` の `jsx: react-jsx` | AI Studio 由来の残骸 + 機能の作りかけ | 一括削除（ビルド警告が消えるところまで） |
| 35 | **Low** | `works.component.ts:288-445` / `activities-list.component.ts:40-193` / `activity-detail.component.ts:38-191` | 保守性 | 活動報告データが3ファイルに丸ごと複製。現時点で ID は全件一致だが、既に `additionalImages` 等の細部が食い違っており、片方だけ更新される事故が構造的に起きる | データとビューの未分離 | alumni-voice 同様に JSON + サービスへ集約 |
| 36 | **Low** | `tsconfig.json` | 型安全 | `strict` 未設定（`strictNullChecks` 等が全部オフ）。`(d:any)` の多用（about.component.ts）と相まって null 系バグをコンパイラが検出できない | 初期設定のまま | `"strict": true` + `strictTemplates` を段階導入 |

## 自明な修正パッチ（例）

**#11 contact のレスポンス二重読み:**
```diff
-      if (response.ok) {
-        let result;
-        try {
-          result = await response.json();
-        } catch (parseError) {
-          const rawBody = await response.text();
-          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
-          throw new Error(`レスポンスの解析に失敗しました: ${errorMessage}. レスポンスボディ: ${rawBody}`);
-        }
+      if (response.ok) {
+        const rawBody = await response.text();
+        let result;
+        try {
+          result = JSON.parse(rawBody);
+        } catch (parseError) {
+          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
+          throw new Error(`レスポンスの解析に失敗しました: ${errorMessage}. レスポンスボディ: ${rawBody}`);
+        }
```

**#3 hero のフォールバックタイマー:**
```diff
+  private fallbackTimeout?: number;
   ...
-      setTimeout(() => {
+      this.fallbackTimeout = window.setTimeout(() => {
         ...
       }, 5000);
   ...
   ngOnDestroy() {
+    if (this.fallbackTimeout) clearTimeout(this.fallbackTimeout);
+    this.enableBodyScroll(true);
```

**#22 homerun の Space 横取り:**
```diff
   onKeyDown(event: KeyboardEvent): void {
+    if (this.gameState() !== 'playing') return;
     if (event.code === 'Space' || event.key === ' ') {
```

**#20 startGame 再入ガード（3ゲーム共通の型）:**
```diff
   startGame(): void {
+    if (this.gameState() === 'playing') return;
```

## 全体所感

コンポーネント分割・signal の使い方・`ngOnDestroy` での後始末など、Angular 20 のモダンな作法は概ね押さえられており、テンプレートが落ちるような初歩的な null 参照はほぼ見当たらない。一方で、(1) **AI Studio 生成時代の配信構成（Tailwind CDN・importmap・プレースホルダー GA）が本番にそのまま残っている**こと、(2) **ハッシュルーティングという土台の選択とサイト全体（sitemap・canonical・テスト・リンク）が矛盾している**こと、(3) **タイマー / rAF / 購読のライフサイクル管理が「実装した箇所」と「漏れた箇所」でまだら**であること、の3系統に問題が集中している。フォーム→GAS の流れは全体としては堅実だが、送信先 URL の二重管理とスプレッドシート書き込みの無害化が課題。

## 今すぐ着手すべき Top 3

1. **URL 戦略の統一（#1, #10, #15）** — `withHashLocation()` を撤去して path ベースに統一。SEO 投資の回収・共有リンク・E2E テストが全てここに掛かっている。
2. **「操作不能」系バグの根絶（#3, #4, #5, #2）** — hero のスクロール永久ロックと strike-pitching のループ増殖は destroy 時のタイマー管理を揃えるだけで直る。catch-fly の判定修正でゲームを遊べる状態に。
3. **本番配信基盤の健全化（#6, #7, #8）** — Tailwind をビルドに組み込み CDN・importmap を撤去、GA4 実 ID 設定、出欠フォームの GAS URL をどちらが生きているか確認して environment に一本化（回答データ喪失の可能性があるため要即確認）。
