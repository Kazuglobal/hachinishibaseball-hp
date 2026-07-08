import { Component, ChangeDetectionStrategy, ElementRef, OnInit, OnDestroy, PLATFORM_ID, Inject, signal, inject, viewChild, effect } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { SEOService } from '../../services/seo.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, SectionTitleComponent, ObserveVisibilityDirective, BackButtonComponent],
  templateUrl: './about.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent implements OnInit, OnDestroy {
  // *ngIfで出し入れされる要素のため、signalベースのviewChildクエリを使う
  // （@ViewChild({static:true})は*ngIf内の要素を解決できず永久にundefinedになるため）
  barChartContainer = viewChild<ElementRef<HTMLElement>>('barChartContainer');

  isVisible = signal(false);
  viewMode = signal<'chart' | 'table'>('chart');

  private readonly colorPalette: string[] = [
    '#0B3B8C', '#0050B3', '#1769E0', '#3B82F6', '#60A5FA',
    '#93C5FD', '#38BDF8', '#22D3EE', '#34D399', '#F59E0B'
  ];

  readonly schoolData = [
    { school: '下長', count: 8 },
    { school: '市川', count: 7 },
    { school: '百石', count: 3 },
    { school: '八戸一', count: 3 },
    { school: '川内', count: 2 },
    { school: '五戸', count: 2 },
    { school: '湊', count: 2 },
    { school: '三沢一', count: 2 },
    { school: '明治', count: 2 },
    { school: '階上', count: 2 },
    { school: '鮫', count: 2 },
    { school: '名川', count: 1 },
    { school: '三本木', count: 1 },
    { school: '小中野', count: 1 },
    { school: '八戸三', count: 1 },
    { school: '七百', count: 1 },
    { school: '八戸二', count: 1 },
    { school: '下田', count: 1 },
    { school: '福地', count: 1 },
    { school: '北稜', count: 1 },
    { school: '佐井', count: 1 },
    { school: '三条', count: 1 },
    { school: '根城', count: 1 },
    { school: '白山台', count: 1 },
    { school: '道仏', count: 1 },
    { school: '堀口', count: 1 },
    { school: '倉石', count: 1 },
    { school: '木ノ下', count: 1 }
  ].sort((a, b) => b.count - a.count || a.school.localeCompare(b.school));

  readonly staffMembers = [
    {
      name: '小川　貴史',
      position: '監督',
      period: '25期',
      education: ['八戸西高校', '駒澤大学'],
      career: ['平成２３年にコーチ就任', '平成３０年に監督就任']
    },
    {
      name: '中村　渉',
      position: '投手コーチ',
      period: '21期',
      education: ['八戸西高校', '青森大学'],
      career: ['三菱製紙八戸クラブ', '北海道日本ハムファイターズ', '平成３０年にコーチ就任']
    },
    {
      name: '齋藤　昌宏',
      position: '部長',
      period: '24期',
      education: ['八戸西高校', '日本体育大学'],
      career: ['平成２３年に八戸西高校監督就任', '三本木農業高校での監督生活を経て八戸西高校に再任']
    },
  ];

  staffVisible = signal(false);
  baseballBallImage = 'assets/images/baseball-ball.png';

  get totalCount(): number {
    return this.schoolData.reduce((sum, r) => sum + r.count, 0);
  }

  getColor(school: string): string {
    const index = this.schoolData.findIndex(s => s.school === school);
    return this.colorPalette[index % this.colorPalette.length];
  }

  private isBrowser: boolean;
  private seoService = inject(SEOService);
  private resizeHandler = () => this.renderChartIfVisible();

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);

    // グラフ表示に切り替わった、またはコンテナ要素が生成されたタイミングで再描画
    effect(() => {
      const container = this.barChartContainer();
      const mode = this.viewMode();
      if (this.isBrowser && container && mode === 'chart') {
        this.createBarChart(container.nativeElement);
      }
    });
  }

  ngOnInit(): void {
    // SEO設定
    this.seoService.updateSEO({
      title: '野球部について | 八戸西高校 | 八戸西高等学校',
      description: '八戸西高校（八戸西高等学校）野球部の紹介。監督・コーチ陣のプロフィール、部員の出身中学校データ、OB会の活動内容などを掲載しています。八戸西高校野球部の歴史と伝統を紹介しています。',
      keywords: '八戸西高校,八戸西高等学校,八戸西高校野球部,八戸西高等学校野球部,野球部,監督,コーチ,部員,出身中学校,OB会,八戸西高校OB会',
      url: 'https://hachinohenishibaseball.com/about'
    });

    // 初期表示を有効にする
    this.isVisible.set(true);
    this.staffVisible.set(true);

    if (this.isBrowser) {
      // ウィンドウリサイズ時に再描画
      window.addEventListener('resize', this.resizeHandler, { passive: true });
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      window.removeEventListener('resize', this.resizeHandler);
    }
  }

  private renderChartIfVisible(): void {
    const container = this.barChartContainer();
    if (container && this.viewMode() === 'chart') {
      this.createBarChart(container.nativeElement);
    }
  }

  private createBarChart(hostElement: HTMLElement): void {
    hostElement.innerHTML = '';

    const data = this.schoolData;
    const margin = { top: 20, right: 60, bottom: 30, left: 100 };
    const containerWidth = Math.max(480, hostElement.clientWidth);
    const width = containerWidth - margin.left - margin.right;
    const barHeight = 20;
    const height = (data.length * (barHeight + 5)) + margin.top + margin.bottom;

    const svg = d3.select(hostElement)
      .append("svg")
        .attr("width", '100%')
        .attr("height", height)
        .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height}`)
      .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain([0, d3.max(data, (d:any) => d.count)])
      .range([0, width]);
      
    const y = d3.scaleBand()
      .domain(data.map((d:any) => d.school))
      .range([0, height - margin.top - margin.bottom])
      .padding(0.2);

    // Y axis
    svg.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .select(".domain").remove(); // Remove axis line

    // X axis grid lines
    const gridHeight = height - margin.top - margin.bottom;
    svg.append("g")			
        .attr("class", "grid")
        .attr("transform", `translate(0, ${gridHeight})`)
        .call(d3.axisBottom(x)
            .ticks(5)
            .tickSize(-gridHeight)
            .tickFormat(() => '')
        )
        .select(".domain").remove();

    svg.selectAll(".grid line")
        .style("stroke", "#e0e0e0")
        .style("stroke-opacity", "0.7")
        .style("shape-rendering", "crispEdges");

    // Bars
    const bars = svg.selectAll(".bar")
      .data(data)
      .enter().append("g");

    bars.append("rect")
      .attr("class", "bar")
      .attr("y", (d:any) => y(d.school)!)
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", 0)
      .attr("fill", (d:any) => this.getColor(d.school))
      .append('title')
      .text((d:any) => `${d.school}: ${d.count}名 (${((d.count/this.totalCount)*100).toFixed(1)}%)`);

    // アニメーションで幅を伸ばす
    svg.selectAll('rect.bar')
      .transition()
      .duration(800)
      .attr("width", (d:any) => x(d.count));
    
    // Bar labels
    bars.append("text")
      .attr("class", "label")
      .attr("y", (d:any) => y(d.school)! + y.bandwidth() / 2)
      .attr("x", (d:any) => x(d.count) + 6)
      .attr("dy", ".35em")
      .style("fill", "#333")
      .style("opacity", 0)
      .text((d:any) => `${d.count}名 (${d3.format('.1f')((d.count/this.totalCount)*100)}%)`)
      .transition()
      .duration(800)
      .delay(400)
      .style("opacity", 1);
      
    // X axis line and labels at the bottom
    svg.append("g")
        .attr("transform", `translate(0, ${gridHeight})`)
        .call(d3.axisBottom(x).ticks(d3.max(data, (d: any) => d.count)).tickFormat(d3.format('d')));
  }
}
