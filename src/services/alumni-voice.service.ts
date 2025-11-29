import { Injectable, inject, signal } from '@angular/core';

/**
 * AlumniVoiceインターフェース
 * ALUMNI VOICEの各記事のデータ構造を定義
 */
export interface AlumniVoice {
  id: string;
  image: string;
  title: string;
  family: string;
  generation: string;
  currentJob: string;
  content: string;
}

/**
 * AlumniVoiceService
 *
 * ALUMNI VOICE記事のデータを管理するサービス
 * JSONファイルからデータを読み込み、コンポーネントに提供する
 *
 * 利点:
 * - データとロジックの分離により、メンテナンスが容易
 * - 新しい記事の追加は、JSONファイルの更新のみで可能
 * - 将来的には、動的な読み込みやAPI連携も容易に実装可能
 */
@Injectable({
  providedIn: 'root'
})
export class AlumniVoiceService {
  private alumniVoices = signal<AlumniVoice[]>([]);
  private isLoaded = signal<boolean>(false);

  constructor() {
    this.loadData();
  }

  /**
   * JSONファイルからデータを読み込む
   * 非同期処理だが、初期化時に一度だけ実行される
   */
  private async loadData(): Promise<void> {
    try {
      // JSONファイルを直接インポートして読み込む
      const response = await fetch('/assets/data/alumni-voices.json');
      const data = await response.json();
      this.alumniVoices.set(data);
      this.isLoaded.set(true);
    } catch (error) {
      console.error('Failed to load alumni voices data:', error);
      this.alumniVoices.set([]);
      this.isLoaded.set(true);
    }
  }

  /**
   * すべてのALUMNI VOICE記事を取得
   * @returns AlumniVoice配列のシグナル
   */
  getAllVoices() {
    return this.alumniVoices;
  }

  /**
   * データのロード状態を取得
   * @returns ロード完了状態のシグナル
   */
  isDataLoaded() {
    return this.isLoaded;
  }

  /**
   * IDで特定の記事を取得
   * @param id 記事のID
   * @returns 該当する記事、見つからない場合はundefined
   */
  getVoiceById(id: string): AlumniVoice | undefined {
    return this.alumniVoices().find(voice => voice.id === id);
  }

  /**
   * 世代でフィルタリングした記事を取得
   * @param generation 世代(例: "32期生")
   * @returns 該当する記事の配列
   */
  getVoicesByGeneration(generation: string): AlumniVoice[] {
    return this.alumniVoices().filter(voice => voice.generation === generation);
  }

  /**
   * 記事数を取得
   * @returns 記事の総数
   */
  getVoicesCount(): number {
    return this.alumniVoices().length;
  }
}
