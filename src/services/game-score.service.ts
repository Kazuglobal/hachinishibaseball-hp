import { Injectable, signal, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface GameScore {
  nickname: string;
  score: number;
  date: string;
}

export interface GameScores {
  homerun: GameScore[];
  pitching: GameScore[];
  catch: GameScore[];
}

export type GameType = 'homerun' | 'pitching' | 'catch';

const STORAGE_KEY = 'hachinishi_game_scores';
const MAX_RANKINGS = 5;

@Injectable({
  providedIn: 'root'
})
export class GameScoreService {
  private scores = signal<GameScores>({
    homerun: [],
    pitching: [],
    catch: []
  });
  
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.loadScores();
  }

  private loadScores(): void {
    if (!this.isBrowser) return;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.scores.set(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load game scores:', e);
    }
  }

  private saveScores(): void {
    if (!this.isBrowser) return;
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.scores()));
    } catch (e) {
      console.error('Failed to save game scores:', e);
    }
  }

  getScores(gameType: GameType): GameScore[] {
    return this.scores()[gameType];
  }

  addScore(gameType: GameType, nickname: string, score: number): number {
    const currentScores = [...this.scores()[gameType]];
    const newScore: GameScore = {
      nickname: nickname || '名無し',
      score,
      date: new Date().toLocaleDateString('ja-JP')
    };

    currentScores.push(newScore);
    currentScores.sort((a, b) => b.score - a.score);
    
    const trimmedScores = currentScores.slice(0, MAX_RANKINGS);
    const rank = trimmedScores.findIndex(s => s === newScore) + 1;

    this.scores.update(scores => ({
      ...scores,
      [gameType]: trimmedScores
    }));

    this.saveScores();
    
    return rank <= MAX_RANKINGS ? rank : 0;
  }

  getHighScore(gameType: GameType): number {
    const scores = this.scores()[gameType];
    return scores.length > 0 ? scores[0].score : 0;
  }

  getBestScore(gameType: GameType): number {
    return this.getHighScore(gameType);
  }

  isHighScore(gameType: GameType, score: number): boolean {
    const scores = this.scores()[gameType];
    if (scores.length < MAX_RANKINGS) return true;
    return score > scores[scores.length - 1].score;
  }

  clearScores(gameType: GameType): void {
    this.scores.update(scores => ({
      ...scores,
      [gameType]: []
    }));
    this.saveScores();
  }
}
