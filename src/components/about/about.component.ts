import { Component, ChangeDetectionStrategy, ElementRef, ViewChild, AfterViewInit, OnInit, PLATFORM_ID, Inject, signal, inject } from '@angular/core';
import { isPlatformBrowser, CommonModule, NgOptimizedImage } from '@angular/common';
import { SectionTitleComponent } from '../shared/section-title/section-title.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { ObserveVisibilityDirective } from '../../directives/observe-visibility.directive';
import { SEOService } from '../../services/seo.service';

declare var d3: any;

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, SectionTitleComponent, ObserveVisibilityDirective, BackButtonComponent, NgOptimizedImage],
  templateUrl: './about.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent implements OnInit, AfterViewInit {
  @ViewChild('barChartContainer', { static: true }) barChartContainer!: ElementRef;
  
  isVisible = signal(false);
  viewMode = signal<'chart' | 'table'>('chart');

  private readonly colorPalette: string[] = [
    '#0B3B8C', '#0050B3', '#1769E0', '#3B82F6', '#60A5FA',
    '#93C5FD', '#38BDF8', '#22D3EE', '#34D399', '#F59E0B'
  ];

  readonly schoolData = [
    { school: '市川', count: 5 },
    { school: '白山台', count: 4 },
    { school: '下長', count: 4 },
    { school: '福地', count: 3 },
    { school: '五戸', count: 3 },
    { school: '名川', count: 2 },
    { school: '東北', count: 2 },
    { school: '八戸第三', count: 2 },
    { school: '百石', count: 2 },
    { school: '八戸第一', count: 2 },
    { school: '湊', count: 2 },
    { school: '三沢第一', count: 2 },
    { school: '八戸第二', count: 1 },
    { school: '北陵', count: 1 },
    { school: '天間林', count: 1 },
    { school: '泊', count: 1 },
    { school: '三戸', count: 1 },
    { school: '三本木', count: 1 },
    { school: '小中野', count: 1 },
    { school: '大館', count: 1 },
    { school: '七百', count: 1 },
    { school: '下田', count: 1 },
    { school: '明治', count: 1 },
    { school: '佐井', count: 1 },
    { school: '長者', count: 1 },
    { school: '倉石', count: 1 }
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
      name: '根深　周平',
      position: '野手コーチ',
      period: '',
      education: ['東奥義塾高校', '仙台大学'],
      career: ['弘前アレッズ　主将', '令和２年にコーチ就任']
    },
    {
      name: '齋藤　昌宏',
      position: '部長',
      period: '24期',
      education: ['八戸西高校', '日本体育大学'],
      career: ['平成２３年に八戸西高校監督就任', '三本木農業高校での監督生活を経て八戸西高校に再任']
    },
    {
      name: '宮重　太一',
      position: '副部長　捕手',
      period: '',
      education: ['八戸高校（平成６年甲子園出場）', '東京学芸大学'],
      career: []
    }
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

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    // SEO設定
    this.seoService.updateSEO({
      title: '野球部について',
      description: '八戸西高等学校野球部の紹介。監督・コーチ陣のプロフィール、部員の出身中学校データ、OB会の活動内容などを掲載しています。',
      keywords: '八戸西高等学校,野球部,監督,コーチ,部員,出身中学校,OB会',
      url: 'https://hachinishibaseball-ob.com/about'
    });

    // 初期表示を有効にする
    this.isVisible.set(true);
    this.staffVisible.set(true);
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.createBarChart();
      // ウィンドウリサイズ時に再描画
      window.addEventListener('resize', () => {
        const host = this.barChartContainer.nativeElement as HTMLElement;
        host.innerHTML = '';
        this.createBarChart();
      }, { passive: true });
    }
  }

  private createBarChart(): void {
    const data = this.schoolData;
    const margin = { top: 20, right: 60, bottom: 30, left: 100 };
    const container = this.barChartContainer.nativeElement as HTMLElement;
    const containerWidth = Math.max(480, container.clientWidth);
    const width = containerWidth - margin.left - margin.right;
    const barHeight = 20;
    const height = (data.length * (barHeight + 5)) + margin.top + margin.bottom;

    const svg = d3.select(this.barChartContainer.nativeElement)
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
            .tickFormat('')
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
      .attr("y", (d:any) => y(d.school))
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
      .attr("y", (d:any) => y(d.school) + y.bandwidth() / 2)
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
