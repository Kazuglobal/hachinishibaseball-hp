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

- `npm run dev` - 開発サーバーを起動（ポート3000）
- `npm run build` - 本番用ビルドを実行
- `npm run preview` - 本番用ビルドをプレビュー

## 技術スタック

- **Angular 20** - フレームワーク
- **TypeScript** - 言語
- **TailwindCSS** - CSSフレームワーク
- **Vite** - ビルドツール

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
