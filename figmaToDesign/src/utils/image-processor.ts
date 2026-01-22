import axios from 'axios';
import * as cheerio from 'cheerio';
import { Page } from 'puppeteer';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';
import { URL } from 'url';

export interface ImageResource {
  url: string;
  data: Buffer | string; // base64 或 Buffer
  mimeType: string;
  width?: number;
  height?: number;
}

export class ImageProcessor {
  private imageCache: Map<string, ImageResource> = new Map();
  private baseUrl: string = '';

  /**
   * 设置基础 URL（用于解析相对路径）
   */
  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  /**
   * 处理网页中的所有图片
   */
  async processWebImages(page: Page): Promise<Map<string, ImageResource>> {
    const images = new Map<string, ImageResource>();

    // 获取所有图片元素
    const imageData = await page.evaluate(() => {
      const results: Array<{
        src: string;
        width: number;
        height: number;
        tag: string;
      }> = [];

      // <img> 标签
      document.querySelectorAll('img').forEach((img) => {
        if (img.src) {
          results.push({
            src: img.src,
            width: img.naturalWidth || img.width || 0,
            height: img.naturalHeight || img.height || 0,
            tag: 'img',
          });
        }
      });

      // CSS background-image
      const allElements = document.querySelectorAll('*');
      allElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none' && bgImage.startsWith('url(')) {
          const match = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
          if (match && match[1]) {
            const bgUrl = match[1];
            if (bgUrl.startsWith('http') || bgUrl.startsWith('data:')) {
              results.push({
                src: bgUrl,
                width: el.clientWidth || 0,
                height: el.clientHeight || 0,
                tag: 'background',
              });
            }
          }
        }
      });

      return results;
    });

    // 下载所有图片
    for (const imgData of imageData) {
      try {
        const image = await this.downloadImage(imgData.src);
        if (image) {
          images.set(imgData.src, {
            ...image,
            width: imgData.width || image.width,
            height: imgData.height || image.height,
          });
        }
      } catch (error) {
        console.warn(`下载图片失败: ${imgData.src}`, error);
      }
    }

    return images;
  }

  /**
   * 处理 HTML 代码中的图片
   */
  async processHtmlImages(html: string, baseUrl: string = ''): Promise<Map<string, ImageResource>> {
    const $ = cheerio.load(html);
    const images = new Map<string, ImageResource>();

    this.setBaseUrl(baseUrl);

    // 处理 <img> 标签
    $('img').each(async (_, el) => {
      const $img = $(el);
      const src = $img.attr('src');
      if (src) {
        try {
          const image = await this.downloadImage(src);
          if (image) {
            images.set(src, image);
          }
        } catch (error) {
          console.warn(`下载图片失败: ${src}`, error);
        }
      }
    });

    // 处理 CSS background-image
    $('*').each(async (_, el) => {
      const $el = $(el);
      const style = $el.attr('style');
      if (style) {
        const bgMatch = style.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/);
        if (bgMatch && bgMatch[1]) {
          const bgUrl = bgMatch[1];
          if (!bgUrl.startsWith('data:')) {
            try {
              const image = await this.downloadImage(bgUrl);
              if (image) {
                images.set(bgUrl, image);
              }
            } catch (error) {
              console.warn(`下载背景图片失败: ${bgUrl}`, error);
            }
          }
        }
      }
    });

    return images;
  }

  /**
   * 下载图片
   */
  private async downloadImage(url: string): Promise<ImageResource | null> {
    // 检查缓存
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url)!;
    }

    try {
      // 处理 data URL
      if (url.startsWith('data:')) {
        return this.processDataUrl(url);
      }

      // 解析 URL
      const absoluteUrl = this.resolveUrl(url);
      if (!absoluteUrl) {
        return null;
      }

      // 下载图片
      const response = await axios.get(absoluteUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const buffer = Buffer.from(response.data);
      const mimeType = response.headers['content-type'] || mime.lookup(absoluteUrl) || 'image/png';

      const image: ImageResource = {
        url: absoluteUrl,
        data: buffer,
        mimeType: mimeType as string,
      };

      // 缓存
      this.imageCache.set(url, image);
      this.imageCache.set(absoluteUrl, image);

      return image;
    } catch (error) {
      console.warn(`下载图片失败: ${url}`, error);
      return null;
    }
  }

  /**
   * 处理 data URL
   */
  private processDataUrl(dataUrl: string): ImageResource | null {
    try {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const base64Data = match[2];
        return {
          url: dataUrl,
          data: base64Data,
          mimeType,
        };
      }
    } catch (error) {
      console.warn('处理 data URL 失败', error);
    }
    return null;
  }

  /**
   * 解析相对 URL 为绝对 URL
   */
  private resolveUrl(url: string): string | null {
    try {
      // 已经是绝对 URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }

      // 需要基础 URL
      if (!this.baseUrl) {
        return null;
      }

      const base = new URL(this.baseUrl);
      return new URL(url, base).href;
    } catch (error) {
      console.warn(`解析 URL 失败: ${url}`, error);
      return null;
    }
  }

  /**
   * 将图片转换为 base64
   */
  imageToBase64(image: ImageResource): string {
    if (typeof image.data === 'string') {
      // 已经是 base64
      if (image.data.startsWith('data:')) {
        return image.data;
      }
      return `data:${image.mimeType};base64,${image.data}`;
    } else {
      // Buffer 转 base64
      return `data:${image.mimeType};base64,${image.data.toString('base64')}`;
    }
  }

  /**
   * 将图片保存到文件
   */
  async saveImageToFile(image: ImageResource, outputDir: string): Promise<string> {
    try {
      await fs.mkdir(outputDir, { recursive: true });

      const ext = mime.extension(image.mimeType) || 'png';
      const filename = `${this.hashUrl(image.url)}.${ext}`;
      const filepath = path.join(outputDir, filename);

      if (typeof image.data === 'string') {
        if (image.data.startsWith('data:')) {
          // 提取 base64 数据
          const base64Data = image.data.split(',')[1];
          await fs.writeFile(filepath, base64Data, 'base64');
        } else {
          await fs.writeFile(filepath, image.data, 'base64');
        }
      } else {
        await fs.writeFile(filepath, image.data);
      }

      return filepath;
    } catch (error) {
      throw new Error(`保存图片失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 生成 URL 的哈希值（用于文件名）
   */
  private hashUrl(url: string): string {
    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.imageCache.clear();
  }
}
