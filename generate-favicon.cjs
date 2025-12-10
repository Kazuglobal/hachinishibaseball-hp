const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-192x192.png', size: 192 },
  { name: 'favicon-512x512.png', size: 512 }
];

const svgPath = path.join(__dirname, 'public', 'favicon.svg');
const publicDir = path.join(__dirname, 'public');

async function generateFavicons() {
  try {
    console.log('🎨 ファビコンを生成中...');

    const svgBuffer = fs.readFileSync(svgPath);

    for (const { name, size } of sizes) {
      const outputPath = path.join(publicDir, name);

      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      console.log(`✓ ${name} を生成しました (${size}x${size})`);
    }

    // favicon.icoを32x32のPNGから生成
    const icoPath = path.join(publicDir, 'favicon.ico');
    await sharp(svgBuffer)
      .resize(32, 32)
      .png()
      .toFile(icoPath);

    console.log(`✓ favicon.ico を生成しました`);

    // ルートディレクトリにもfavicon.icoをコピー
    const rootIcoPath = path.join(__dirname, 'favicon.ico');
    fs.copyFileSync(icoPath, rootIcoPath);
    console.log(`✓ ルートディレクトリにfavicon.icoをコピーしました`);

    console.log('\n✨ すべてのファビコンの生成が完了しました！');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

generateFavicons();
