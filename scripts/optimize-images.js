#!/usr/bin/env node

/**
 * 画像最適化スクリプト
 * - JPEG/PNGを圧縮
 * - WebP形式を生成
 * - レスポンシブ画像用の複数サイズを生成
 */

import sharp from 'sharp';
import { readdir, stat, mkdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { existsSync } from 'fs';

const ASSETS_DIR = 'src/assets/images';
const OUTPUT_DIR = 'src/assets/images-optimized';

// 画像サイズのプリセット（レスポンシブ対応）
const RESPONSIVE_SIZES = {
  large: 1920,
  medium: 1200,
  small: 800,
  thumbnail: 400
};

// JPEG品質設定
const JPEG_QUALITY = 85;
const WEBP_QUALITY = 85;

// PNG圧縮設定
const PNG_QUALITY = 85;

/**
 * ディレクトリを再帰的に取得
 */
async function getAllFiles(dir, fileList = []) {
  const files = await readdir(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const fileStat = await stat(filePath);

    if (fileStat.isDirectory()) {
      await getAllFiles(filePath, fileList);
    } else {
      const ext = extname(file).toLowerCase();
      if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        fileList.push(filePath);
      }
    }
  }

  return fileList;
}

/**
 * 画像を最適化
 */
async function optimizeImage(inputPath) {
  const ext = extname(inputPath).toLowerCase();
  const fileName = basename(inputPath, ext);
  const relativePath = inputPath.replace(ASSETS_DIR + '/', '');
  const outputBase = join(OUTPUT_DIR, relativePath.replace(basename(inputPath), ''));

  // 出力ディレクトリを作成
  if (!existsSync(outputBase)) {
    await mkdir(outputBase, { recursive: true });
  }

  console.log(`\n処理中: ${relativePath}`);

  const image = sharp(inputPath);
  const metadata = await image.metadata();

  console.log(`  元のサイズ: ${metadata.width}x${metadata.height}`);
  console.log(`  元のフォーマット: ${metadata.format}`);

  const originalSize = (await stat(inputPath)).size;
  console.log(`  元のファイルサイズ: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);

  const tasks = [];

  // オリジナルサイズの最適化版を生成
  if (ext === '.jpg' || ext === '.jpeg') {
    // JPEG最適化
    const outputPath = join(outputBase, `${fileName}.jpg`);
    tasks.push(
      image.clone()
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(outputPath)
        .then(async (info) => {
          const newSize = (await stat(outputPath)).size;
          const reduction = ((1 - newSize / originalSize) * 100).toFixed(1);
          console.log(`  ✓ JPEG: ${(newSize / 1024 / 1024).toFixed(2)}MB (${reduction}% 削減)`);
        })
    );

    // WebP生成
    const webpPath = join(outputBase, `${fileName}.webp`);
    tasks.push(
      image.clone()
        .webp({ quality: WEBP_QUALITY })
        .toFile(webpPath)
        .then(async (info) => {
          const newSize = (await stat(webpPath)).size;
          const reduction = ((1 - newSize / originalSize) * 100).toFixed(1);
          console.log(`  ✓ WebP: ${(newSize / 1024 / 1024).toFixed(2)}MB (${reduction}% 削減)`);
        })
    );
  } else if (ext === '.png') {
    // PNG最適化
    const outputPath = join(outputBase, `${fileName}.png`);
    tasks.push(
      image.clone()
        .png({ quality: PNG_QUALITY, compressionLevel: 9 })
        .toFile(outputPath)
        .then(async (info) => {
          const newSize = (await stat(outputPath)).size;
          const reduction = ((1 - newSize / originalSize) * 100).toFixed(1);
          console.log(`  ✓ PNG: ${(newSize / 1024 / 1024).toFixed(2)}MB (${reduction}% 削減)`);
        })
    );

    // WebP生成
    const webpPath = join(outputBase, `${fileName}.webp`);
    tasks.push(
      image.clone()
        .webp({ quality: WEBP_QUALITY })
        .toFile(webpPath)
        .then(async (info) => {
          const newSize = (await stat(webpPath)).size;
          const reduction = ((1 - newSize / originalSize) * 100).toFixed(1);
          console.log(`  ✓ WebP: ${(newSize / 1024 / 1024).toFixed(2)}MB (${reduction}% 削減)`);
        })
    );
  }

  // レスポンシブサイズを生成（オリジナルより大きいサイズは生成しない）
  for (const [sizeName, width] of Object.entries(RESPONSIVE_SIZES)) {
    if (metadata.width && width < metadata.width) {
      // JPEG/PNG
      const resizedExt = ext === '.png' ? '.png' : '.jpg';
      const resizedPath = join(outputBase, `${fileName}-${sizeName}${resizedExt}`);

      const processor = image.clone().resize(width, null, {
        withoutEnlargement: true,
        fit: 'inside'
      });

      if (ext === '.png') {
        tasks.push(
          processor
            .png({ quality: PNG_QUALITY, compressionLevel: 9 })
            .toFile(resizedPath)
        );
      } else {
        tasks.push(
          processor
            .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
            .toFile(resizedPath)
        );
      }

      // WebP版
      const webpResizedPath = join(outputBase, `${fileName}-${sizeName}.webp`);
      tasks.push(
        image.clone()
          .resize(width, null, {
            withoutEnlargement: true,
            fit: 'inside'
          })
          .webp({ quality: WEBP_QUALITY })
          .toFile(webpResizedPath)
      );
    }
  }

  await Promise.all(tasks);
  console.log(`  ✓ 完了`);
}

/**
 * メイン処理
 */
async function main() {
  console.log('🖼️  画像最適化を開始します...\n');
  console.log(`入力ディレクトリ: ${ASSETS_DIR}`);
  console.log(`出力ディレクトリ: ${OUTPUT_DIR}\n`);

  // 出力ディレクトリを作成
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }

  // すべての画像ファイルを取得
  const imageFiles = await getAllFiles(ASSETS_DIR);

  console.log(`${imageFiles.length}個の画像ファイルが見つかりました\n`);

  // 各画像を最適化
  for (const imagePath of imageFiles) {
    try {
      await optimizeImage(imagePath);
    } catch (error) {
      console.error(`✗ エラー: ${imagePath}`, error.message);
    }
  }

  console.log('\n✅ すべての画像の最適化が完了しました！');
  console.log(`\n最適化された画像は ${OUTPUT_DIR} に保存されています。`);
  console.log('元の画像を置き換える場合は、手動でコピーしてください。');
}

main().catch(console.error);
