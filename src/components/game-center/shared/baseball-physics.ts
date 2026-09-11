/**
 * 野球ミニゲーム共通の「リアル野球」モデル
 * ------------------------------------------------------------------
 * 3つのミニゲーム（ホームランチャレンジ / ストライクピッチング / 守備キャッチ）が
 * 共通で使う、実際の野球に基づいた寸法・球種・物理計算をまとめたモジュール。
 *
 * 数値の根拠:
 *  - 投手板〜本塁 18.44m、塁間 27.43m（公認野球規則）
 *  - ストライクゾーン幅 = 本塁幅 43.2cm + ボール直径 7.3cm ×2 ≒ 57.8cm
 *  - 打球の飛距離は空気抵抗（Cd≒0.33）とバックスピンによるマグヌス揚力（Cl≒0.2）を
 *    含む数値積分で算出。初速160km/h・打球角28°で約124m・滞空5.1秒となり、
 *    実際のトラッキングデータ（100mph / 28° ≒ 400ft）とほぼ一致する。
 *  - 打球種別ごとの安打確率は実際のBABIP（ライナー .690 / ゴロ .240 / フライ .210）に準拠。
 */

// ====================================================================
// フィールド寸法（メートル）
// ====================================================================
export const FIELD = {
  /** 投手板から本塁までの距離 */
  MOUND_TO_PLATE: 18.44,
  /** 塁間 */
  BASE_PATH: 27.43,
  /** ストライクゾーン幅（本塁幅＋ボール2個分） */
  ZONE_WIDTH: 0.578,
  /** ストライクゾーン下端（膝下）: 身長175cmの打者基準 */
  ZONE_BOTTOM: 0.50,
  /** ストライクゾーン上端（肩とベルトの中間） */
  ZONE_TOP: 1.12,
  /** 高校野球の標準的なフェンス距離: 両翼 */
  FENCE_LINE: 92,
  /** 高校野球の標準的なフェンス距離: 中堅 */
  FENCE_CENTER: 118,
  /** フェンスの高さ */
  FENCE_HEIGHT: 3.2,
  /** ファウルラインの角度（本塁から±45度） */
  FOUL_ANGLE: 45,
} as const;

/** 本塁のスプレー角からフェンスまでの距離（度: -45=左翼線, 0=中堅, +45=右翼線） */
export function fenceDistanceAt(sprayAngleDeg: number): number {
  const t = Math.min(1, Math.abs(sprayAngleDeg) / FIELD.FOUL_ANGLE);
  // 中堅が最も深く、ラインに向かうほど浅くなる（実際の球場形状に近い曲線）
  return FIELD.FENCE_CENTER - (FIELD.FENCE_CENTER - FIELD.FENCE_LINE) * Math.pow(t, 1.35);
}

// ====================================================================
// 球種（高校野球〜社会人レベルの実測値レンジ）
// ====================================================================
export type PitchTypeId = 'fastball' | 'slider' | 'curve' | 'forkball' | 'changeup' | 'shoot';

export interface PitchType {
  id: PitchTypeId;
  /** 表示名 */
  name: string;
  /** 略称（スコアボード表示用） */
  short: string;
  /** 球速レンジ km/h */
  speedKmh: [number, number];
  /**
   * 変化量（メートル）。捕手側から見た向きで、
   * x: ＋が右打者のインコース方向（右投手のシュート方向）、
   * y: ＋が浮き上がり、－が落ちる。
   * 重力に対する見かけの変化（vertical break）として扱う。
   */
  break: { x: number; y: number };
  /** 変化の出方（1.0=一定、2.0以上=手元で鋭く変化） */
  breakSharpness: number;
  /** 打者が見極めにくいほど高い（0〜1）。打者AIの判断ブレに使う */
  deception: number;
  /** 表示色 */
  color: string;
}

export const PITCH_TYPES: Record<PitchTypeId, PitchType> = {
  fastball: {
    id: 'fastball',
    name: 'ストレート',
    short: 'ST',
    speedKmh: [132, 146],
    // 4シームはバックスピンで「落ちにくい」＝見かけ上わずかに浮き上がる
    break: { x: 0.06, y: 0.12 },
    breakSharpness: 1.0,
    deception: 0.1,
    color: '#ff4d4d',
  },
  shoot: {
    id: 'shoot',
    name: 'シュート',
    short: 'SH',
    speedKmh: [128, 140],
    break: { x: 0.30, y: -0.10 },
    breakSharpness: 1.6,
    deception: 0.3,
    color: '#ff9f43',
  },
  slider: {
    id: 'slider',
    name: 'スライダー',
    short: 'SL',
    speedKmh: [116, 130],
    break: { x: -0.34, y: -0.20 },
    breakSharpness: 2.4,
    deception: 0.5,
    color: '#4dd0e1',
  },
  curve: {
    id: 'curve',
    name: 'カーブ',
    short: 'CB',
    speedKmh: [98, 114],
    break: { x: -0.20, y: -0.55 },
    breakSharpness: 1.4,
    deception: 0.4,
    color: '#9b6dff',
  },
  forkball: {
    id: 'forkball',
    name: 'フォーク',
    short: 'FK',
    speedKmh: [118, 130],
    break: { x: 0.02, y: -0.48 },
    breakSharpness: 3.0,
    deception: 0.7,
    color: '#4caf50',
  },
  changeup: {
    id: 'changeup',
    name: 'チェンジアップ',
    short: 'CH',
    speedKmh: [108, 122],
    break: { x: 0.18, y: -0.26 },
    breakSharpness: 1.8,
    deception: 0.6,
    color: '#ffd54f',
  },
};

export const PITCH_TYPE_LIST: PitchType[] = [
  PITCH_TYPES.fastball,
  PITCH_TYPES.slider,
  PITCH_TYPES.curve,
  PITCH_TYPES.forkball,
  PITCH_TYPES.changeup,
  PITCH_TYPES.shoot,
];

/**
 * 投球の軌道。
 * progress = 0（リリース）〜 1（捕手のミット）の正規化した位置に対し、
 * 狙った到達点からの「変化によるズレ」を返す（メートル）。
 *
 * 実際の変化球は初速の慣性で最初はまっすぐ進み、
 * 手元（progress後半）で一気に変化する。これを progress^sharpness で表現している。
 */
export function breakOffsetAt(pitch: PitchType, progress: number): { x: number; y: number } {
  const p = Math.max(0, Math.min(1, progress));
  const k = Math.pow(p, pitch.breakSharpness);
  // 到達時（p=1）に変化量がゼロになる = 打者から見た到達点は狙い通り。
  // 途中経過では「まだ変化していない位置」に見えるので、逆向きのオフセットを返す。
  return {
    x: -pitch.break.x * (1 - k),
    y: -pitch.break.y * (1 - k),
  };
}

/** 球速(km/h)からリリース〜本塁到達までの時間(秒)。実際は空気抵抗で約8%減速する */
export function pitchFlightTime(speedKmh: number): number {
  const v0 = speedKmh / 3.6;
  const vAvg = v0 * 0.94;
  // リリースポイントは投手板より約1.5m前
  return (FIELD.MOUND_TO_PLATE - 1.5) / vAvg;
}

/** 球種のランダムな球速を返す（stamina 0〜1 で球速が落ちる） */
export function rollPitchSpeed(pitch: PitchType, stamina = 1): number {
  const [lo, hi] = pitch.speedKmh;
  const base = lo + Math.random() * (hi - lo);
  // スタミナ切れで最大8km/h減速
  return Math.round(base - (1 - Math.max(0, Math.min(1, stamina))) * 8);
}

// ====================================================================
// ストライクゾーン（9分割 + ボールゾーン）
// ====================================================================

/** ゾーン座標: x = -1(外角) 〜 +1(内角), y = -1(低め) 〜 +1(高め) を正規化したもの */
export interface ZonePoint { x: number; y: number; }

/** 1〜9のゾーン番号（1が左上、9が右下）を正規化座標に変換 */
export function zoneToPoint(zone: number): ZonePoint {
  const row = Math.floor((zone - 1) / 3); // 0=高め
  const col = (zone - 1) % 3;             // 0=左
  return {
    x: (col - 1) * (2 / 3),
    y: (1 - row) * (2 / 3),
  };
}

/** 正規化座標がストライクゾーン内かどうか（|x|<=1 かつ |y|<=1 でストライク） */
export function isStrike(p: ZonePoint): boolean {
  return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
}

/** 正規化座標をメートルに変換（x: 左右, y: 地面からの高さ） */
export function zonePointToMeters(p: ZonePoint): { x: number; height: number } {
  const halfWidth = FIELD.ZONE_WIDTH / 2;
  const midHeight = (FIELD.ZONE_TOP + FIELD.ZONE_BOTTOM) / 2;
  const halfHeight = (FIELD.ZONE_TOP - FIELD.ZONE_BOTTOM) / 2;
  return { x: p.x * halfWidth, height: midHeight + p.y * halfHeight };
}

// ====================================================================
// 打球の物理（空気抵抗 + マグヌス揚力つき数値積分）
// ====================================================================
const BALL_MASS = 0.145;                     // kg
const BALL_RADIUS = 0.0366;                  // m
const BALL_AREA = Math.PI * BALL_RADIUS ** 2; // m^2
const AIR_DENSITY = 1.225;                   // kg/m^3
const DRAG_COEFF = 0.33;
const LIFT_COEFF = 0.20;                     // バックスピンによる揚力
const GRAVITY = 9.81;

export interface BattedBallTrajectory {
  /** 飛距離（水平距離, m） */
  distance: number;
  /** 滞空時間（秒） */
  hangTime: number;
  /** 最高到達点（m） */
  apex: number;
  /** 描画用の軌跡サンプル（水平距離, 高さ） */
  path: { d: number; h: number; t: number }[];
}

/**
 * 打球の飛翔をシミュレートする。
 * @param exitVelocityKmh 打球初速
 * @param launchAngleDeg  打球角度（0=水平, 90=真上）
 * @param backspin        バックスピン量 0〜1.5（ゴロは0に近い）
 */
export function simulateBattedBall(
  exitVelocityKmh: number,
  launchAngleDeg: number,
  backspin = 1,
): BattedBallTrajectory {
  const v0 = exitVelocityKmh / 3.6;
  const theta = (launchAngleDeg * Math.PI) / 180;

  const kd = (AIR_DENSITY * DRAG_COEFF * BALL_AREA) / (2 * BALL_MASS);
  const kl = (AIR_DENSITY * LIFT_COEFF * BALL_AREA * backspin) / (2 * BALL_MASS);

  let d = 0;
  let h = 1.0; // 打点の高さ
  let vd = v0 * Math.cos(theta);
  let vh = v0 * Math.sin(theta);

  const dt = 1 / 120;
  let t = 0;
  let apex = h;
  let step = 0;
  // 軌跡は30Hzで間引いて保持する（飛行全体を必ずカバーする）
  const SAMPLE_EVERY = 4;
  const path: { d: number; h: number; t: number }[] = [{ d: 0, h, t: 0 }];

  while (h > 0 && t < 12) {
    const speed = Math.hypot(vd, vh);
    const ad = -kd * speed * vd - kl * speed * vh;
    const ah = -GRAVITY - kd * speed * vh + kl * speed * vd;
    vd += ad * dt;
    vh += ah * dt;
    d += vd * dt;
    h += vh * dt;
    t += dt;
    step++;
    if (h > apex) apex = h;
    if (step % SAMPLE_EVERY === 0) path.push({ d, h: Math.max(0, h), t });
  }

  // 着地点を必ず終端に含める
  path.push({ d, h: 0, t });

  return { distance: d, hangTime: t, apex, path };
}

// ====================================================================
// 打球の分類と結果判定
// ====================================================================
export type BattedBallType = 'ground' | 'liner' | 'fly' | 'popup';

/** 打球角度から打球種別を判定（実際の分類基準に準拠） */
export function classifyBattedBall(launchAngleDeg: number): BattedBallType {
  if (launchAngleDeg < 10) return 'ground';
  if (launchAngleDeg < 25) return 'liner';
  if (launchAngleDeg < 50) return 'fly';
  return 'popup';
}

export const BATTED_BALL_LABEL: Record<BattedBallType, string> = {
  ground: 'ゴロ',
  liner: 'ライナー',
  fly: 'フライ',
  popup: 'ポップフライ',
};

/**
 * 打球種別ごとの安打確率（実際のBABIPに準拠）。
 *  ライナー .690 / ゴロ .240 / フライ .210 / ポップフライ .020
 * ゴロは打球の速さが安打かどうかをほぼ決めるため、初速で大きく変動させる。
 * また、内野に上がった小フライはほぼアウトになる。
 */
export function hitProbability(
  type: BattedBallType,
  exitVelocityKmh: number,
  distanceM = 60,
): number {
  if (type === 'popup') return 0.02;

  if (type === 'ground') {
    // 弱いゴロは野手の正面、速いゴロは野手の間を抜ける
    return clamp(0.04 + ((exitVelocityKmh - 90) / 110) * 0.48, 0.03, 0.52);
  }

  const base = type === 'liner' ? 0.69 : 0.21;
  // 初速130km/h以上の強い当たりはヒットになりやすい
  const hard = Math.max(0, Math.min(1, (exitVelocityKmh - 130) / 40));
  let p = base * (1 + hard * 0.55);

  // 内野に上がった程度のフライはほぼ確実に捕られる
  if (type === 'fly' && distanceM < 50) {
    p *= clamp(distanceM / 50, 0.08, 1) * 0.5;
  }
  return Math.min(0.95, p);
}

/**
 * ゴロが転がって到達する距離。
 * 空中の落下地点にバウンドと転がりを足したもので、実際の「打球到達距離」に近づける。
 */
export function groundBallRoll(exitVelocityKmh: number, airDistanceM: number): number {
  const v = exitVelocityKmh / 3.6;
  // 速い打球ほど遠くまで転がる（外野を抜ければ90m前後で止まる）
  return Math.min(95, airDistanceM + v * 1.55);
}

/**
 * バレルゾーン判定（最も本塁打になりやすい初速・角度の組み合わせ）。
 * 実際の定義（98mph以上かつ26〜30度を中心に、速いほど角度域が広がる）を簡略化。
 */
export function isBarrel(exitVelocityKmh: number, launchAngleDeg: number): boolean {
  if (exitVelocityKmh < 155) return false;
  const spread = 4 + (exitVelocityKmh - 155) * 0.5;
  return Math.abs(launchAngleDeg - 28) <= spread;
}

// ====================================================================
// ミート（バットとボールの接触）モデル
// ====================================================================
export interface ContactInput {
  /** タイミング誤差（ミリ秒）。＋が振り遅れ、－が早い */
  timingErrorMs: number;
  /** バットの芯とボールの上下方向のズレ（cm）。＋がボールの上を叩く（ゴロ）*/
  verticalMissCm: number;
  /** バットの芯とボールの内外方向のズレ（cm）。＋が外寄りを叩く */
  horizontalMissCm?: number;
  /** 打者のパワー係数（1.0=標準） */
  power?: number;
  /** 投球の球速（km/h）。速い球ほど跳ね返りの初速が上がる */
  pitchSpeedKmh?: number;
}

export interface ContactResult {
  /** 空振りか */
  whiff: boolean;
  exitVelocityKmh: number;
  launchAngleDeg: number;
  /** スプレー角（度）: －が左方向（右打者の引っ張り）、＋が右方向 */
  sprayAngleDeg: number;
  /** 芯で捉えた度合い 0〜1 */
  quality: number;
  backspin: number;
}

/** スイングの許容タイミング幅（ミリ秒）。これを超えると空振り */
export const SWING_WINDOW_MS = 110;
/** バットの有効幅（cm）。これを超える上下ズレは空振り */
export const BAT_VERTICAL_WINDOW_CM = 9;
/** バットが届く内外の範囲（cm）。これを超えると空振り（差し込まれ／手が出ない） */
export const BAT_HORIZONTAL_WINDOW_CM = 22;

/**
 * タイミングとミートのズレから打球のパラメータを計算する。
 *
 * 実際の打撃では
 *  - タイミングが合うほど打球初速が上がる
 *  - ボールの下側を叩くと打球角度が上がり（フライ）、上側を叩くとゴロになる
 *  - 早く振ると引っ張り、振り遅れると流し打ちになる
 * という関係があり、これをモデル化している。
 */
export function computeContact(input: ContactInput): ContactResult {
  const power = input.power ?? 1;
  const pitchSpeed = input.pitchSpeedKmh ?? 135;
  const timing = input.timingErrorMs;
  const vMiss = input.verticalMissCm;
  const hMiss = input.horizontalMissCm ?? 0;

  const timingRatio = Math.abs(timing) / SWING_WINDOW_MS;
  const vertRatio = Math.abs(vMiss) / BAT_VERTICAL_WINDOW_CM;
  const horizRatio = Math.abs(hMiss) / BAT_HORIZONTAL_WINDOW_CM;

  if (timingRatio >= 1 || vertRatio >= 1 || horizRatio >= 1) {
    return { whiff: true, exitVelocityKmh: 0, launchAngleDeg: 0, sprayAngleDeg: 0, quality: 0, backspin: 0 };
  }

  // 芯で捉えた度合い（タイミング・上下・内外のズレがすべて小さいほど高い）
  const quality = Math.max(0, 1 - Math.hypot(timingRatio, vertRatio, horizRatio) / Math.sqrt(3));

  // 打球初速: バットスピードと投球の球速の合成。芯を外すほど大きく落ちる
  // 実測レンジ 100〜170km/h に収まるように係数を設定
  const maxExit = (118 + pitchSpeed * 0.32) * power; // 135km/hの球を芯で捉えて約161km/h
  const exitVelocityKmh = Math.max(55, maxExit * (0.42 + 0.58 * Math.pow(quality, 0.75)));

  // 打球角度: ボールの下を叩く(vMiss<0)ほど上がる。芯で捉えると理想の25〜30度付近に収束
  // -9cm(下端) → 約58度, 0cm(芯) → 約17度, +9cm(上端) → 約-18度
  const angleFromMiss = -vMiss * 4.2 + 17;
  // タイミングのズレは打球角度をばらつかせる
  const angleNoise = (Math.random() - 0.5) * 14 * (1 - quality);
  const launchAngleDeg = Math.max(-30, Math.min(80, angleFromMiss + angleNoise));

  // スプレー角: 早いと引っ張り、遅いと流し打ちになる。
  // 実際の打球方向はミリ秒単位のタイミングで大きく変わり、
  // わずかに early な（引っ張る）スイングが最も本塁打になりやすい。
  // 約±53ms でファウルラインに達する感度に設定している。
  const sprayAngleDeg = -(timing / SWING_WINDOW_MS) * 85
    - (hMiss / BAT_HORIZONTAL_WINDOW_CM) * 16
    + (Math.random() - 0.5) * 10 * (1 - quality);

  // バックスピン: 下を叩くほど強く、ゴロはトップスピンぎみで飛ばない
  const backspin = Math.max(0.15, Math.min(1.4, 1.05 - vMiss * 0.07));

  return {
    whiff: false,
    exitVelocityKmh: Math.round(exitVelocityKmh),
    launchAngleDeg: Math.round(launchAngleDeg * 10) / 10,
    sprayAngleDeg: Math.max(-70, Math.min(70, sprayAngleDeg)),
    quality,
    backspin,
  };
}

// ====================================================================
// 打席結果
// ====================================================================
export type PlayOutcome =
  | 'homerun'
  | 'triple'
  | 'double'
  | 'single'
  | 'out'
  | 'foul'
  | 'strikeout'
  | 'walk';

export interface PlayResult {
  outcome: PlayOutcome;
  battedType: BattedBallType | null;
  exitVelocityKmh: number;
  launchAngleDeg: number;
  sprayAngleDeg: number;
  /** 飛距離（m） */
  distance: number;
  hangTime: number;
  trajectory: BattedBallTrajectory | null;
  barrel: boolean;
}

/** 打球のパラメータから打席結果を決定する */
export function resolveBattedBall(contact: ContactResult): PlayResult {
  const traj = simulateBattedBall(contact.exitVelocityKmh, contact.launchAngleDeg, contact.backspin);
  const battedType = classifyBattedBall(contact.launchAngleDeg);
  const barrel = isBarrel(contact.exitVelocityKmh, contact.launchAngleDeg);

  // ゴロは転がる距離を含めて「打球到達距離」として表示する
  const reportedDistance = battedType === 'ground'
    ? groundBallRoll(contact.exitVelocityKmh, traj.distance)
    : traj.distance;

  const base: Omit<PlayResult, 'outcome'> = {
    battedType,
    exitVelocityKmh: contact.exitVelocityKmh,
    launchAngleDeg: contact.launchAngleDeg,
    sprayAngleDeg: contact.sprayAngleDeg,
    distance: Math.round(reportedDistance),
    hangTime: Math.round(traj.hangTime * 100) / 100,
    trajectory: traj,
    barrel,
  };

  // ファウルライン外
  if (Math.abs(contact.sprayAngleDeg) > FIELD.FOUL_ANGLE) {
    return { ...base, outcome: 'foul' };
  }

  // 本塁打判定: フェンスまでの距離を越え、かつフェンスの高さをクリアしているか
  const fence = fenceDistanceAt(contact.sprayAngleDeg);
  if (traj.distance > fence) {
    return { ...base, outcome: 'homerun' };
  }
  // フェンス手前で落ちるが、フェンス到達時の高さが十分あれば本塁打
  const atFence = traj.path.find(p => p.d >= fence);
  if (atFence && atFence.h > FIELD.FENCE_HEIGHT) {
    return { ...base, outcome: 'homerun' };
  }

  // 安打判定（打球種別ごとのBABIPに準拠）
  if (Math.random() < hitProbability(battedType, contact.exitVelocityKmh, traj.distance)) {
    // 安打の内訳は実際の割合に合わせる（単打が約7割、三塁打はごくまれ）
    const roll = Math.random();
    const deep = battedType !== 'ground' && traj.distance > fence - 12;
    if (deep && roll < 0.06) return { ...base, outcome: 'triple' };
    if (deep && roll < 0.45) return { ...base, outcome: 'double' };
    if (battedType !== 'ground' && traj.distance > 78 && roll < 0.28) return { ...base, outcome: 'double' };
    // 外野を抜ける強いゴロ
    if (battedType === 'ground' && reportedDistance > 88 && roll < 0.18) return { ...base, outcome: 'double' };
    return { ...base, outcome: 'single' };
  }

  return { ...base, outcome: 'out' };
}

export const OUTCOME_LABEL: Record<PlayOutcome, string> = {
  homerun: 'ホームラン',
  triple: '三塁打',
  double: '二塁打',
  single: 'ヒット',
  out: 'アウト',
  foul: 'ファウル',
  strikeout: '三振',
  walk: 'フォアボール',
};

// ====================================================================
// 打者AI（ストライクピッチング用）
// ====================================================================
export interface BatterProfile {
  name: string;
  /** 打率（0〜1） */
  average: number;
  /** 長打力（0〜1） */
  power: number;
  /** 選球眼（0〜1）: 高いほどボール球を振らない */
  eye: number;
  /** コンタクト力（0〜1）: 高いほど空振りしない */
  contact: number;
}

export const BATTER_LINEUP: BatterProfile[] = [
  { name: '1番 中堅手', average: 0.31, power: 0.25, eye: 0.80, contact: 0.82 },
  { name: '2番 二塁手', average: 0.28, power: 0.20, eye: 0.75, contact: 0.85 },
  { name: '3番 遊撃手', average: 0.34, power: 0.65, eye: 0.72, contact: 0.78 },
  { name: '4番 一塁手', average: 0.32, power: 0.90, eye: 0.60, contact: 0.68 },
  { name: '5番 右翼手', average: 0.29, power: 0.75, eye: 0.58, contact: 0.70 },
  { name: '6番 三塁手', average: 0.26, power: 0.55, eye: 0.55, contact: 0.72 },
  { name: '7番 捕手', average: 0.24, power: 0.40, eye: 0.50, contact: 0.70 },
  { name: '8番 左翼手', average: 0.22, power: 0.30, eye: 0.48, contact: 0.68 },
  { name: '9番 投手', average: 0.15, power: 0.15, eye: 0.40, contact: 0.60 },
];

/**
 * 打者が振るかどうかを判定する。
 * 実際の打者はストライクゾーン内は7割前後振り、ボール球でもゾーンに近いほど手を出す（チェイス率）。
 */
export function batterWillSwing(
  batter: BatterProfile,
  location: ZonePoint,
  pitch: PitchType,
  strikeCount: number,
  ballCount: number,
): boolean {
  const dist = Math.max(Math.abs(location.x), Math.abs(location.y));
  let swingChance: number;
  if (dist <= 1) {
    // ストライクゾーン内: 真ん中ほど振る
    swingChance = 0.55 + (1 - dist) * 0.35;
  } else {
    // ボールゾーン: ゾーンから離れるほど振らない（選球眼で減衰）
    const chase = Math.max(0, 1 - (dist - 1) * 1.6);
    swingChance = chase * (0.55 - batter.eye * 0.35);
  }
  // 変化球の球種による惑わし
  swingChance += pitch.deception * 0.12 * (dist > 1 ? 1 : -0.3);
  // 追い込まれるとゾーンを広げる / ボール先行だと待つ
  if (strikeCount >= 2) swingChance += 0.22;
  if (ballCount >= 3 && dist > 1) swingChance -= 0.18;

  return Math.random() < Math.max(0, Math.min(0.97, swingChance));
}

/** 打者が振った結果（空振り / ファウル / インプレー）を返す */
export function batterSwingResult(
  batter: BatterProfile,
  location: ZonePoint,
  pitch: PitchType,
  speedKmh: number,
): { kind: 'whiff' | 'foul' | 'inplay'; result?: PlayResult } {
  const dist = Math.max(Math.abs(location.x), Math.abs(location.y));

  // 空振り率: ゾーンを外れるほど、球速が速いほど、球種の惑わしが強いほど高い
  // （実際の空振り率は1スイングあたり2〜3割）
  const whiffBase = 0.30 + Math.max(0, dist - 0.4) * 0.38 + pitch.deception * 0.20
    + Math.max(0, speedKmh - 132) * 0.008;
  const whiffChance = Math.max(0.06, Math.min(0.85, whiffBase * (1.35 - batter.contact)));
  if (Math.random() < whiffChance) return { kind: 'whiff' };

  // ファウル率: 芯を外した当たり（実際もスイングの3〜4割はファウル）
  const foulChance = 0.34 + Math.max(0, dist - 0.6) * 0.2;
  if (Math.random() < foulChance) return { kind: 'foul' };

  // インプレー: 打者の能力と投球コースから打球を生成
  // 甘いコース（ゾーン中央）ほど芯で捉えられるが、完璧に捉えられることはまれ
  const centerness = Math.max(0, 1 - dist);
  const skill = 0.34 + batter.average * 0.85;
  const quality = Math.min(0.94, centerness * skill + Math.random() * 0.3 * skill);
  // 引っ張り傾向。実際の打者、とくに長距離打者は引っ張った打球で本塁打を打つ
  const pullBias = -(6 + batter.power * 16);
  const timingErrorMs = pullBias
    + (1 - quality) * (Math.random() - 0.5) * 2 * SWING_WINDOW_MS * 0.9;

  // 打球角度のばらつき。実際の打者はしっかり捉えた当たりでも
  // ゴロからフライまで角度が散る（平均12度前後・標準偏差が大きい）ので、
  // 芯の上下のズレには精度とは別に一定のばらつきを与える。
  const spread = gaussian() * 3.1 * (1 + batter.power * 0.25);
  const verticalMissCm = spread
    + (1 - quality) * (Math.random() - 0.5) * 2 * BAT_VERTICAL_WINDOW_CM * 0.6;

  const contact = computeContact({
    timingErrorMs,
    verticalMissCm,
    power: 0.82 + batter.power * 0.26,
    pitchSpeedKmh: speedKmh,
  });
  if (contact.whiff) return { kind: 'foul' };

  const result = resolveBattedBall(contact);
  if (result.outcome === 'foul') return { kind: 'foul' };
  return { kind: 'inplay', result };
}

// ====================================================================
// 汎用ヘルパー
// ====================================================================
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 平均0・標準偏差1の正規乱数（中心極限定理による近似） */
export function gaussian(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** km/h を m/s に */
export function kmhToMs(kmh: number): number {
  return kmh / 3.6;
}
