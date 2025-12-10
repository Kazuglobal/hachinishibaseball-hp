<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 八戸西高等学校野球OB会

八戸西高等学校野球OB会の公式ウェブサイトです。

View your app in AI Studio: https://ai.studio/apps/drive/1RvqAaXsfH7bWrc1RWwAKVrpHTL4bhqvi

## 開発環境セットアップ

### 前提条件

- Node.js (推奨バージョン: 18以上)
- npm または yarn

### セットアップ手順

1. **依存関係のインストール**
   ```bash
   npm install
   ```

2. **環境変数の設定（オプション）**
   AI Studioを使用する場合は、`.env.local`ファイルを作成し、Gemini APIキーを設定してください：
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. **開発サーバーの起動**
   ```bash
   npm run dev
   ```
   ブラウザで `http://localhost:3000` にアクセスしてください。

### 利用可能なコマンド

- `npm run dev` - 開発サーバーを起動（ポート4200）
- `npm run build` - 本番用ビルドを実行
- `npm run preview` - 本番用ビルドをプレビュー
- `npm run test` - Playwrightテストを実行
- `npm run test:ui` - Playwright UIモードでテストを実行
- `npm run test:headed` - ブラウザを表示してテストを実行

### テストについて

プロジェクトには**Playwright**を使用したE2Eテストが含まれています。

#### テストの実行手順

1. **Playwrightブラウザのインストール（初回のみ）**
   ```bash
   npx playwright install chromium
   ```

2. **テストの実行**
   ```bash
   npm run test
   ```

3. **UIモードでテストを実行（推奨）**
   ```bash
   npm run test:ui
   ```

#### テストの内容

- **総会出席フォーム** (`tests/meeting-form.spec.ts`)
  - フォームの表示確認
  - 必須フィールドのバリデーション
  - 出席/欠席での正常な送信
  - エラー処理の確認
  - フォームのリセット機能

## 技術スタック

- **Angular 20** - フレームワーク
- **TypeScript** - 言語
- **TailwindCSS** - CSSフレームワーク
- **Vite** - ビルドツール
- **Playwright** - E2Eテストフレームワーク

## プロジェクト構成

```
.
├── src/                    # ソースコード
│   ├── components/         # Angularコンポーネント
│   ├── directives/         # カスタムディレクティブ
│   └── services/           # サービス
├── index.html              # エントリーポイントHTML
├── index.tsx               # アプリケーションエントリーポイント
├── angular.json            # Angular設定
├── tsconfig.json           # TypeScript設定
├── tailwind.config.js      # TailwindCSS設定
└── package.json            # 依存関係
```

## 開発時の注意事項

- TypeScriptの型チェックが有効になっています
- TailwindCSSはCDNとローカル設定の両方に対応しています
- カスタムアニメーションは`index.css`に定義されています
# hachinishibaseball-hp
