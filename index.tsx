
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { IMAGE_LOADER, ImageLoaderConfig } from '@angular/common';
import { AppComponent } from './src/app.component';
import { routes } from './src/app.routes';

// ローカル画像用の画像ローダー
function localImageLoader(config: ImageLoaderConfig): string {
  // 既に完全なURL（http:// または https:// で始まる）の場合はそのまま返す
  if (config.src.startsWith('http://') || config.src.startsWith('https://')) {
    return config.src;
  }
  // ローカル画像の場合はそのまま返す（/assets/ で始まるパス）
  return config.src;
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation()),
    {
      provide: IMAGE_LOADER,
      useValue: localImageLoader,
    },
  ],
}).catch(err => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types.