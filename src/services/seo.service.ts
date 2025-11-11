import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

export interface SEOData {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
  author?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SEOService {
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private document = inject(DOCUMENT);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  
  private readonly baseUrl = 'https://hachinishibaseball-ob.com';
  private readonly defaultImage = `${this.baseUrl}/assets/og-image.jpg`;
  private readonly siteName = '八戸西高等学校野球OB会';

  /**
   * ページのSEO情報を設定
   */
  updateSEO(data: SEOData): void {
    if (!this.isBrowser) return;

    const {
      title,
      description,
      keywords,
      image = this.defaultImage,
      url,
      type = 'website',
      author = '八戸西高等学校野球OB会'
    } = data;

    // Title設定
    if (title) {
      const fullTitle = `${title} | ${this.siteName}`;
      this.titleService.setTitle(fullTitle);
      this.metaService.updateTag({ name: 'title', content: fullTitle });
    }

    // Description設定
    if (description) {
      this.metaService.updateTag({ name: 'description', content: description });
    }

    // Keywords設定
    if (keywords) {
      this.metaService.updateTag({ name: 'keywords', content: keywords });
    }

    // Author設定
    if (author) {
      this.metaService.updateTag({ name: 'author', content: author });
    }

    // Open Graph設定
    const ogTags = [
      { property: 'og:title', content: title ? `${title} | ${this.siteName}` : this.siteName },
      { property: 'og:description', content: description || '' },
      { property: 'og:image', content: image },
      { property: 'og:url', content: url || this.baseUrl },
      { property: 'og:type', content: type },
      { property: 'og:site_name', content: this.siteName },
      { property: 'og:locale', content: 'ja_JP' }
    ];

    ogTags.forEach(tag => {
      if (tag.content) {
        this.metaService.updateTag(tag);
      }
    });

    // Twitter Card設定
    const twitterTags = [
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title ? `${title} | ${this.siteName}` : this.siteName },
      { name: 'twitter:description', content: description || '' },
      { name: 'twitter:image', content: image }
    ];

    twitterTags.forEach(tag => {
      if (tag.content) {
        this.metaService.updateTag(tag);
      }
    });

    // Canonical URL設定
    if (url) {
      this.updateCanonicalUrl(url);
    }
  }

  /**
   * Canonical URLを更新
   */
  private updateCanonicalUrl(url: string): void {
    let link: HTMLLinkElement | null = this.document.querySelector("link[rel='canonical']");
    
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    
    link.setAttribute('href', url);
  }

  /**
   * 構造化データ（JSON-LD）を追加
   */
  addStructuredData(data: object): void {
    if (!this.isBrowser) return;

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(data);
    script.id = 'structured-data';
    
    // 既存の構造化データを削除
    const existing = this.document.getElementById('structured-data');
    if (existing) {
      existing.remove();
    }
    
    this.document.head.appendChild(script);
  }

  /**
   * 記事ページ用の構造化データを追加
   */
  addArticleStructuredData(data: {
    headline: string;
    description: string;
    image?: string;
    datePublished: string;
    dateModified?: string;
    author?: string;
  }): void {
    const articleData = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": data.headline,
      "description": data.description,
      "image": data.image || this.defaultImage,
      "datePublished": data.datePublished,
      "dateModified": data.dateModified || data.datePublished,
      "author": {
        "@type": "Organization",
        "name": data.author || this.siteName
      },
      "publisher": {
        "@type": "Organization",
        "name": this.siteName,
        "logo": {
          "@type": "ImageObject",
          "url": `${this.baseUrl}/assets/logo.png`
        }
      }
    };

    this.addStructuredData(articleData);
  }

  /**
   * 動画ページ用の構造化データを追加
   */
  addVideoStructuredData(data: {
    name: string;
    description: string;
    thumbnailUrl: string;
    uploadDate: string;
    contentUrl: string;
  }): void {
    const videoData = {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "name": data.name,
      "description": data.description,
      "thumbnailUrl": data.thumbnailUrl,
      "uploadDate": data.uploadDate,
      "contentUrl": data.contentUrl
    };

    this.addStructuredData(videoData);
  }

  /**
   * パンくずリスト用の構造化データを追加
   */
  addBreadcrumbStructuredData(items: Array<{ name: string; url: string }>): void {
    const breadcrumbData = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": items.map((item, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "name": item.name,
        "item": item.url
      }))
    };

    this.addStructuredData(breadcrumbData);
  }

  /**
   * スポーツチーム用の構造化データを追加
   */
  addSportsTeamStructuredData(data: {
    name: string;
    sport: string;
    description?: string;
    url?: string;
  }): void {
    const teamData = {
      "@context": "https://schema.org",
      "@type": "SportsTeam",
      "name": data.name,
      "sport": data.sport,
      "description": data.description || "",
      "url": data.url || this.baseUrl,
      "memberOf": {
        "@type": "Organization",
        "name": this.siteName
      }
    };

    this.addStructuredData(teamData);
  }

  /**
   * イベント用の構造化データを追加
   */
  addEventStructuredData(data: {
    name: string;
    description: string;
    startDate: string;
    endDate?: string;
    location?: string;
    image?: string;
  }): void {
    const eventData = {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": data.name,
      "description": data.description,
      "startDate": data.startDate,
      "endDate": data.endDate || data.startDate,
      "location": data.location ? {
        "@type": "Place",
        "name": data.location
      } : undefined,
      "image": data.image || this.defaultImage,
      "organizer": {
        "@type": "Organization",
        "name": this.siteName,
        "url": this.baseUrl
      }
    };

    // undefinedのプロパティを削除
    Object.keys(eventData).forEach(key => {
      if (eventData[key as keyof typeof eventData] === undefined) {
        delete eventData[key as keyof typeof eventData];
      }
    });

    this.addStructuredData(eventData);
  }

  /**
   * 構造化データを削除
   */
  removeStructuredData(): void {
    if (!this.isBrowser) return;
    const existing = this.document.getElementById('structured-data');
    if (existing) {
      existing.remove();
    }
  }
}



