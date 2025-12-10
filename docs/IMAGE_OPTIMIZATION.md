# 画像最適化ガイド

このドキュメントでは、Webサイトの画像を最適化してパフォーマンスを向上させる方法を説明します。

## 現在の問題点

### 大きなファイルサイズ
- **hero-loading.gif**: 16MB（最大の問題）
- **大きなJPEG画像**: 5-7MB（taisai1.jpg, taisai2.jpg, elementary-baseball-clinic-2025.jpgなど）
- **大きなPNG画像**: 6MB（obevent.png）、2.9MB（line.png）

### パフォーマンスへの影響
- 初回ロード時間が長い
- モバイルデータ通信量が大きい
- ユーザー体験の低下

## 実装済みの改善

### 1. WebP形式のサポート
主要な画像に`<picture>`タグを使用してWebP形式をサポート：

```html
<picture>
  <source
    type="image/webp"
    srcset="/assets/images/hero-first-view.webp"
    width="1920"
    height="1080">
  <img
    ngSrc="/assets/images/hero-first-view.jpg"
    width="1920"
    height="1080"
    alt="説明文"
    priority
    decoding="async">
</picture>
```

### 2. alt属性の改善
すべての画像により説明的なalt属性を追加：
- ✅ 具体的な説明
- ✅ SEOフレンドリー
- ✅ アクセシビリティ向上

### 3. 不要な外部画像の削除
- Picsum（外部画像サービス）を削除
- CSSグラデーションで置き換え

## 画像最適化スクリプトの使用

### 実行方法

```bash
npm run optimize-images
```

このスクリプトは以下を実行します：
1. すべてのJPEG/PNG画像を圧縮（品質85%）
2. WebP形式を生成
3. レスポンシブ画像用の複数サイズを生成（1920px, 1200px, 800px, 400px）

### 出力先
最適化された画像は `src/assets/images-optimized/` に保存されます。

### 最適化後の手順

1. **バックアップを取る**（重要）：
   ```bash
   cp -r src/assets/images src/assets/images-backup
   ```

2. **最適化された画像を確認**：
   ```bash
   ls -lh src/assets/images-optimized/
   ```

3. **元の画像を置き換える**：
   ```bash
   # 慎重に確認してから実行
   cp -r src/assets/images-optimized/* src/assets/images/
   ```

## 重要：hero-loading.gifの最適化

### 問題
16MBのGIFアニメーションは、Webサイトのパフォーマンスに最も大きな影響を与えています。

### 推奨される解決策

#### オプション1: ビデオ形式への変換（最も効果的）

GIFをMP4/WebM形式に変換すると、ファイルサイズを90%以上削減できます：

```bash
# ffmpegを使用してMP4に変換
ffmpeg -i src/assets/images/hero-loading.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" src/assets/images/hero-loading.mp4

# WebMに変換（より小さいファイルサイズ）
ffmpeg -i src/assets/images/hero-loading.gif -c:v libvpx-vp9 -b:v 1M src/assets/images/hero-loading.webm
```

HTMLを更新：

```html
<video
  autoplay
  muted
  playsinline
  preload="auto"
  class="absolute inset-0 w-full h-full object-cover">
  <source src="/assets/images/hero-loading.webm" type="video/webm">
  <source src="/assets/images/hero-loading.mp4" type="video/mp4">
</video>
```

**期待される結果**: 16MB → 1-2MB（約90%削減）

#### オプション2: GIFの最適化

GIFのままで最適化する場合：

```bash
# gifsicleを使用（品質が落ちる可能性あり）
gifsicle -O3 --colors 128 src/assets/images/hero-loading.gif -o src/assets/images/hero-loading-optimized.gif
```

**期待される結果**: 16MB → 4-8MB（50-75%削減）

## ベストプラクティス

### 画像形式の選択
- **写真**: JPEG（品質85-90%）またはWebP
- **イラスト/ロゴ**: PNG（透明度が必要）またはWebP
- **アニメーション**: ビデオ（MP4/WebM）> GIF

### 推奨サイズ
- **ヒーロー画像**: < 500KB
- **コンテンツ画像**: < 200KB
- **サムネイル**: < 50KB

### Angular NgOptimizedImageの活用
```html
<!-- 優先度の高い画像 -->
<img ngSrc="..." priority>

<!-- 遅延読み込み -->
<img ngSrc="..." loading="lazy">

<!-- 非同期デコード -->
<img ngSrc="..." decoding="async">
```

## パフォーマンス測定

最適化前後のパフォーマンスを測定：

```bash
# Lighthouseスコアを確認
npm run build
npm run preview
# ブラウザのDevToolsでLighthouseを実行
```

### 目標値
- **パフォーマンススコア**: 90以上
- **First Contentful Paint (FCP)**: < 1.8秒
- **Largest Contentful Paint (LCP)**: < 2.5秒
- **Total Image Size**: < 3MB

## トラブルシューティング

### WebP画像が表示されない
- ブラウザがWebPをサポートしているか確認
- ファイルパスが正しいか確認
- サーバーがWebPのMIMEタイプを正しく設定しているか確認

### 最適化後の画質が悪い
- JPEG/WebP品質を85から90に上げる
- PNG最適化を緩和する（compressionLevel: 6-7）

## 今後の改善案

1. **CDNの導入**: Cloudflare ImagesやCloudinaryを使用して自動最適化
2. **srcsetの有効化**: レスポンシブ画像のための複数サイズ
3. **ビルド時の自動最適化**: Viteプラグインで自動化
4. **AVIF形式のサポート**: WebPよりさらに小さいフォーマット

## 参考リンク

- [Angular NgOptimizedImage](https://angular.dev/guide/image-optimization)
- [Web.dev - Image Optimization](https://web.dev/fast/#optimize-your-images)
- [Sharp Documentation](https://sharp.pixelplumbing.com/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
