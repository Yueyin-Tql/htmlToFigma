import puppeteer, { Browser, Page } from 'puppeteer';
import { FigmaConverter } from './base-converter.js';
import { ImageProcessor } from '../utils/image-processor.js';
import { FontManager } from '../utils/font-manager.js';
import { AnimationExtractor } from './animation-extractor.js';

export interface WebConversionOptions {
  viewport: {
    width: number;
    height: number;
  };
  theme: 'light' | 'dark';
}

export class WebToFigmaConverter extends FigmaConverter {
  private browser: Browser | null = null;
  private imageProcessor: ImageProcessor = new ImageProcessor();
  private animationExtractor: AnimationExtractor = new AnimationExtractor();

  async convert(url: string, options: WebConversionOptions): Promise<any> {
    try {
      // 启动浏览器
      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      }

      const page = await this.browser.newPage();

      // 设置视口
      await page.setViewport({
        width: options.viewport.width,
        height: options.viewport.height,
        deviceScaleFactor: 2,
      });

      // 设置主题（通过媒体查询）
      if (options.theme === 'dark') {
        await page.emulateMediaFeatures([
          { name: 'prefers-color-scheme', value: 'dark' },
        ]);
      }

      // 导航到页面
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // 等待页面完全加载
      await page.waitForTimeout(2000);

      // 获取页面内容
      const html = await page.content();
      const styles = await this.extractStyles(page);

      // 提取动画信息
      this.animationExtractor.extractFromCss(styles);
      const interactions = await this.animationExtractor.extractInteractionStates(page);
      const jsAnimations = await this.animationExtractor.detectJavaScriptAnimations(page);

      // 处理图片
      this.imageProcessor.setBaseUrl(url);
      const images = await this.imageProcessor.processWebImages(page);
      this.images = images;

      // 处理字体
      const fonts = await this.fontManager.detectFonts(page);
      this.setFonts(fonts);

      // 设置图片处理器和图片资源到基础转换器
      this.setImageProcessor(this.imageProcessor);
      this.setImages(images);

      // 关闭页面
      await page.close();

      // 转换为 Figma 格式
      const figmaData = await this.htmlToFigma(html, styles, options.viewport);

      // 添加动画元数据
      figmaData.metadata = {
        animations: this.animationExtractor.getAnimationMetadata(),
        interactions,
        jsAnimations,
      };

      return figmaData;
    } catch (error) {
      throw new Error(`网页转换失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async extractStyles(page: Page): Promise<string> {
    return await page.evaluate(() => {
      const styles: string[] = [];

      // 提取所有样式表
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule) => {
            if (rule instanceof CSSStyleRule) {
              styles.push(rule.cssText);
            } else if (rule instanceof CSSMediaRule) {
              styles.push(rule.cssText);
            }
          });
        } catch (e) {
          // 跨域样式表可能无法访问
        }
      });

      // 提取内联样式
      document.querySelectorAll('[style]').forEach((el) => {
        const style = (el as HTMLElement).style.cssText;
        if (style) {
          styles.push(`${el.tagName.toLowerCase()} { ${style} }`);
        }
      });

      return styles.join('\n');
    });
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
