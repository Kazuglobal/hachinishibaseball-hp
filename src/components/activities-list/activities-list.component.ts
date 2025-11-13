import { Component, ChangeDetectionStrategy, OnInit, signal, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { NgOptimizedImage } from '@angular/common';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';

interface Activity {
  id: string;
  image: string;
  category: string;
  title: string;
  date: string;
  content: string;
  additionalImages?: string[];
}

@Component({
  selector: 'app-activities-list',
  standalone: true,
  imports: [
    CommonModule,
    SectionTitleComponent,
    BackButtonComponent,
    NgOptimizedImage,
    RouterLink,
    ObserveVisibilityDirective
  ],
  templateUrl: './activities-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivitiesListComponent implements OnInit {
  private isBrowser: boolean;
  isVisible = signal(false);

  // 活動報告データ（ActivityDetailComponentと同じデータ）
  activities: Activity[] = [
    { 
      id: 'newyear-ob-2025',
      image: '/assets/images/newyear-ob-2025.jpg', 
      category: 'イベントレポート', 
      title: '新年OB会', 
      date: '2025年1月2日',
      content: '新年の幕開けとともに、パークホテルに野球部OBの皆様が集いました。毎年恒例となっている八戸西高校野球部OB会が、今年も1月2日午後3時より開催され、世代を超えた絆を深める貴重な機会となりました。会場にはOBで現役プロ野球選手の日本ハムファイターズ福島投手も駆けつけ、OBたちとの交流を深めました。また、現役大学生も参加し、先輩OBたちから貴重な経験談に熱心に耳を傾ける姿が印象的でした。八戸西高校野球部の歴史と伝統を受け継ぎ、世代を超えて繋がる同窓生たちの熱い思いが、会場全体を包み込んでいました。開催時間を毎年1月2日午後3時に固定することで、より多くのOBの皆様に参加していただけるよう工夫を重ねています。来年も変わらぬ場所で、さらに多くの同窓生との再会を心待ちにしております。OBの皆様、ぜひ来年もご参加ください！',
      additionalImages: ['/assets/images/newyear-ob-2025-2.jpg']
    },
    { 
      id: 'gonohe-festival-2024',
      image: '/assets/images/gonohe-festival-2024.jpg', 
      category: '支援活動', 
      title: '五戸まつりへの参加', 
      date: '2024年12月18日',
      content: '私たち硬式野球部は、今年の五戸まつりで山車の引き子として参加させていただきました。坂道の多い町で山車を引くのは想像以上に力が必要でしたが、日頃の野球部での体力トレーニングが活きたと感じています。部員一同、地域の伝統行事に携われたことを誇りに思っています。そんな私たちの活動を評価していただき、18日に五戸お祭りライオンズクラブ（三浦浩会長）から、活動に必要な練習球約10万円相当を寄贈いただきました。贈呈式では前主将の山田が代表として「地域が一体となって楽しい祭りを作り上げることができました。後輩たちにもぜひこの経験をしてほしい」と話しました。ボランティアサークル部の皆さんと一緒に活動できたことも、私たちにとって貴重な経験となりました。今回いただいた物品は大切に使わせていただき、これからも地域の行事に積極的に参加していきたいと思います。最後になりましたが、五戸お祭りライオンズクラブの皆様、本当にありがとうございました。'
    },
    { 
      id: 'support-school-exchange-2024',
      image: '/assets/images/support-school-exchange-2024.jpg', 
      category: '交流会', 
      title: '八戸高等支援学校との交流', 
      date: '2024年11月11日',
      content: '今日は八戸高等支援学校との交流を行いました。午前中は7つの班に分かれて普通科の生徒さんと一緒に作業をし、昼食は産業科の生徒さんが作ったカレーをいただきました。午後は普段使っているボールの修繕も体験できました。感謝の気持ち、人に優しく接する事、道具を大切にする事、インクルーシブ教育の大切さ等、たくさん学んだ一日でした。八高支の皆さん、しんくんありがとう'
    },
    { 
      id: 'practice-game-komadai-2024',
      image: '/assets/images/practice-game-komadai-2024.jpg', 
      category: '練習試合', 
      title: '今年最後の練習試合（駒大苫小牧）', 
      date: '2024年11月9日',
      content: '今年最後の練習試合は駒大苫小牧高校さんと行いました。試合後は両校合同で本校の合宿所に泊まり、楽しい夕食を共に過ごしました。また、試合後にはメンタルトレーナーの津村さんにも振り返りをしていただき、充実した内容の合宿になりそうです。この合宿では、洗濯や布団の準備、部屋の掃除など、生活力の向上も目的としています。明日は藤田トレーナーにフィジカルも鍛えてもらう予定なので、心技体全てパワーアップして合宿を終えたいと思います！'
    },
    { 
      id: 'ground-closing-2024',
      image: '/assets/images/ground-closing-2024.jpg', 
      category: 'イベントレポート', 
      title: 'グランド納めと３年生を送る会', 
      date: '2024年11月3日',
      content: '11月3日(日)グラウンド納めと3年生を送る会が行われました。グラウンド納めでは3年生対OBチームの試合が行われ、結果は6対7でOBチームのサヨナラ勝ちとなりました！3年生もOBも久しぶりの試合を楽しみ、全力でプレーしていました。3年生を送る会では1、2年生から色紙のプレゼントや余興などがありました。3年生の皆さんが残してくれた後輩へのメッセージを忘れず、これからも練習に励んでください。OB会からは榎本会長(10期生)より印鑑の贈呈と祝辞がありました。夜は3年生とスタッフ3名で焼肉に行きました。今までの思い出話をしながら楽しい時間を過ごしました。3年生の皆さんお疲れ様でした。進路実現に向けて頑張ってください！'
    },
    { 
      id: 'anniversary-lecture-2024',
      image: '/assets/images/anniversary-lecture-2024.jpg', 
      category: 'イベントレポート', 
      title: '記念講演 斎藤寛仁さん(25期)', 
      date: '2024年11月1日',
      content: '11月1日(金)八戸西高校50周年記念式典、記念講演が行われました。記念講演の中では野球部OBの斎藤寛仁さん(25期生)が声優としての経験談や実際にアフレコなどをしてくださいました。目の前で見るプロのアフレコは圧巻でした。八戸西高校50周年おめでとうございます。'
    },
    { 
      id: 'ai-workshop-2024',
      image: '/assets/images/ai-workshop-2024.jpg', 
      category: 'その他', 
      title: 'AIワークショップ', 
      date: '2024年8月8日',
      content: '8月8日（木）、AIを活用した質問力向上のワークショップを開催しました。この取り組みは、限られた練習時間を有効活用するためのAI導入を目的としています。ワークショップには、テクノロジー法務の専門家である金子晋輔弁護士と大舘さん（30期）が講師として参加し、AIの可能性や法的・倫理的側面について指導しました。部員たちは、AIを活用して練習メニューを作成し、その提案を批判的に評価することで、AIの効果的な活用方法を学びました。主将の敦賀君は、「自分たちが知らない練習方法をさまざま知ることができた。AIの可能性と同時に、使う側の責任についても基本的なことを学べて良かった」と述べています。',
      additionalImages: ['/assets/images/ai-workshop-2024-2.jpg']
    },
    { 
      id: 'freeblaze-support-2025',
      image: '/assets/images/freeblaze-support-2025.jpg', 
      category: '応援活動', 
      title: 'フリーブレイズ応援', 
      date: '2025年1月11日',
      content: '八戸フリーブレイズの試合に応援に行きました。八戸フリーブレイズは地元にあるアイスホッケーチームです。部員一同、アイスホッケーの迫力あるプレーに大興奮でした。スピード感あふれる試合展開と選手たちの熱いプレーに、会場全体が一体となって応援する姿が印象的でした。地元のプロスポーツチームを応援することで、部員たちのモチベーションも大きく向上しました。'
    },
    { 
      id: 'elementary-baseball-clinic-2025',
      image: '/assets/images/elementary-baseball-clinic-2025.jpg', 
      category: '地域貢献', 
      title: '小学生向け野球教室', 
      date: '2025年2月22日(土)',
      content: '2025年2月22日(土)ダイヤモンドクラブ八戸さんとの野球教室が行われました。八西野球部の練習を一緒にし、藤田トレーナーのウォーミングアップや津村さんのメンタルトレーニング、ポジション別の守備練習やバッティングなどを体験していただきました。選手も人に教えるという貴重な経験ができる良い機会となりました。ありがとうございました。'
    },
    { 
      id: 'graduation-ceremony-2025',
      image: '/assets/images/graduation-ceremony-2025.jpg', 
      category: 'イベントレポート', 
      title: '卒業式', 
      date: '2025年3月1日(土)',
      content: '3月1日(土)卒業式が行われました。1、2年生からは3年生に向けて激励のハカを送り、その後応援歌と共に胴上げをし、卒業を祝福しました。3年生の皆さん、ご卒業おめでとうございます。新たなステージでの更なる活躍期待しています！！'
    },
    { 
      id: 'hachikoshi-practice-2025',
      image: '/assets/images/hachikoshi-practice-2025.jpg', 
      category: '練習', 
      title: '八高支練習', 
      date: '2025年11月10日',
      content: '八戸高等支援学校の生徒さんたちと交流しました。お互いに刺激を受けながら、楽しく練習に取り組みました。この交流を通じて、部員たちは多様性を理解し、お互いを尊重することの大切さを学びました。',
      additionalImages: [
        '/assets/images/hachishien2.jpg',
        '/assets/images/hachishien3.jpg'
      ]
    },
    { 
      id: 'sansha-festival-2025',
      image: '/assets/images/sansha-festival-2025.jpg', 
      category: '地域貢献', 
      title: '三社大祭', 
      date: '2025年7月20日',
      content: '三社大祭に参加しました。地域の伝統行事に参加し、地域の方々との交流を深めることができました。部員たちは地域の一員として、祭りの運営にも協力させていただきました。',
      additionalImages: [
        '/assets/images/taisai1.jpg',
        '/assets/images/taisai2.jpg',
        '/assets/images/taisai3.jpg',
        '/assets/images/taisai4.jpg'
      ]
    },
    { 
      id: 'training-camp-2025',
      image: '/assets/images/training-camp-2025.jpg', 
      category: '練習', 
      title: '合宿', 
      date: '2025年4月5日',
      content: '夏季合宿を行いました。集中した練習と生活を通じて、技術面だけでなく精神面も大きく成長しました。共同生活の中で、チームワークの大切さを再確認し、お互いを支え合う姿勢が身につきました。'
    },
    { 
      id: 'exchange-activity-2025',
      image: '/assets/images/exchange-activity-2025.jpg', 
      category: '練習', 
      title: '冬季練習', 
      date: '2025年3月6日',
      content: '2025年3月6日、冬季練習を行いました。寒さに負けず、部員一同が集中して練習に取り組みました。基礎体力の向上を目的としたランニングや筋力トレーニング、そして技術面の向上のための守備練習やバッティング練習など、多岐にわたるメニューを実施しました。冬季の厳しい環境の中での練習は、部員たちの精神面も鍛え、チーム全体の結束を深める良い機会となりました。春季大会に向けて、この冬季練習で培った体力と技術を活かし、さらなる成長を目指していきます。'
    },
    { 
      id: 'sendai-expedition-2025',
      image: '/assets/images/sendai-expedition-2025.jpg', 
      category: '遠征', 
      title: '仙台遠征', 
      date: '2025年6月7日（土）8日（日）',
      content: '2025年6月7日（土）8日（日）の2日間、甲子園予選に向けた強化合宿として仙台遠征に行きました。今回の試合を通して、春季大会から成長した所とこれからの課題が明確になった試合となりました。千葉経済大学附属高校さん、仙台育英学園高校さんありがとうございました！'
    },
    { 
      id: 'yoga-training-2025',
      image: '/assets/images/yoga-training-2025.jpg', 
      category: 'トレーニング', 
      title: 'ヨガトレーニング', 
      date: '2025年6月18日',
      content: '2025年6月18日　ヨガ・瞑想トレーナーの恵先生から呼吸法やストレッチ、ヨガを教えていただきました。柔軟性と集中力の向上を目的とし、部員たちも積極的に取り組みました。心身のバランスを整えることで、パフォーマンスの向上にもつながっています。',
      additionalImages: [
        '/assets/images/yoga1.jpg'
      ]
    },
  ];

  sortedActivities: Activity[] = [];

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    this.isVisible.set(true);
    
    // 日付順にソート（最新が最初）
    this.sortedActivities = [...this.activities].sort((a, b) => {
      const dateA = this.parseDate(a.date);
      const dateB = this.parseDate(b.date);
      return dateB.getTime() - dateA.getTime(); // 降順（新しい順）
    });
  }

  // 日付文字列をDateオブジェクトに変換
  private parseDate(dateString: string): Date {
    // "2025年10月5日" または "2025年6月7日（土）8日（日）" の形式をパース
    const match = dateString.match(/(\d+)年(\d+)月(\d+)日/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 月は0から始まる
      const day = parseInt(match[3], 10);
      return new Date(year, month, day);
    }
    return new Date(0); // パースに失敗した場合は古い日付を返す
  }

  // コンテンツのプレビューテキストを取得（最初の100文字）
  getPreviewText(content: string): string {
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
  }
}

