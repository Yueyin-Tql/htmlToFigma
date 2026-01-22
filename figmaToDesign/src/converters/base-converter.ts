import * as cheerio from 'cheerio';
import { parse as parseCss, Rule } from 'css-tree';
import { SelectorMatcher } from './selector-matcher.js';
import { SvgConverter } from './svg-converter.js';
import { ImageProcessor, ImageResource } from '../utils/image-processor.js';
import { FontManager, FontInfo } from '../utils/font-manager.js';

export interface Viewport {
  width: number;
  height: number;
}

export abstract class FigmaConverter {
  protected cheerioInstance: cheerio.CheerioAPI | null = null;
  protected imageProcessor: ImageProcessor | null = null;
  protected fontManager: FontManager = new FontManager();
  protected images: Map<string, ImageResource> = new Map();
  protected fonts: Map<string, FontInfo> = new Map();

  /**
   * 设置图片处理器
   */
  setImageProcessor(processor: ImageProcessor) {
    this.imageProcessor = processor;
  }

  /**
   * 设置图片资源
   */
  setImages(images: Map<string, ImageResource>) {
    this.images = images;
  }

  /**
   * 设置字体信息
   */
  setFonts(fonts: Map<string, FontInfo>) {
    this.fonts = fonts;
  }

  protected async htmlToFigma(html: string, css: string, viewport: Viewport): Promise<any> {
    const $ = cheerio.load(html);
    this.cheerioInstance = $;
    const body = $('body');

    // 解析 CSS
    const cssRules = this.parseCssRules(css);

    // 创建 Figma 文档结构
    const figmaDocument = {
      name: 'Document',
      type: 'DOCUMENT',
      children: [
        {
          name: 'Page 1',
          type: 'CANVAS',
          backgroundColor: { r: 1, g: 1, b: 1, a: 1 },
          children: [],
        },
      ],
    };

    const page = figmaDocument.children[0];

    // 转换 body 内容
    if (body.length > 0) {
      const bodyChildren = body.children().toArray();
      for (const child of bodyChildren) {
        if (child.type === 'tag') {
          const $child = body.find(child.tagName).first();
          const node = await this.convertElement($child, cssRules, viewport);
          if (node) {
            page.children.push(node);
          }
        }
      }
    }

    return {
      document: figmaDocument,
      components: {},
      componentSets: {},
      schemaVersion: 0,
      styles: this.extractStyles(cssRules),
    };
  }

  protected async convertElement(
    $element: cheerio.Cheerio<cheerio.Element>,
    cssRules: Map<string, any>,
    viewport: Viewport,
    parentStyles: any = {}
  ): Promise<any> {
    const element = $element[0];
    if (!element || element.type !== 'tag') {
      return null;
    }

    const tagName = element.tagName.toLowerCase();
    const computedStyles = this.computeStyles($element, cssRules, parentStyles);

    // 跳过 script、style、meta 等标签
    if (['script', 'style', 'meta', 'link', 'title', 'head'].includes(tagName)) {
      return null;
    }

    // 处理 SVG 元素
    if (SvgConverter.isSvgElement(tagName)) {
      const svgNode = SvgConverter.convertSvgElement($element);
      if (svgNode) {
        return {
          ...svgNode,
          name: $element.attr('id') || $element.attr('class') || 'SVG',
        };
      }
    }

    // 处理图片元素
    if (tagName === 'img') {
      const imgSrc = $element.attr('src');
      if (imgSrc && this.images.has(imgSrc)) {
        const image = this.images.get(imgSrc)!;
        const imgNode = await this.createImageNode($element, image, computedStyles, viewport);
        if (imgNode) {
          return imgNode;
        }
      }
    }

    const children: any[] = [];

    // 处理直接子元素
    const childElements = $element.children();
    for (let i = 0; i < childElements.length; i++) {
      const $child = childElements.eq(i);
      const child = await this.convertElement($child, cssRules, viewport, computedStyles);
      if (child) {
        children.push(child);
      }
    }

    // 处理直接文本内容（如果元素没有子元素，或者文本在子元素之间）
    if (children.length === 0) {
      const text = $element.text().trim();
      if (text) {
        children.push({
          type: 'TEXT',
          characters: text,
          style: this.getTextStyle(computedStyles),
        });
      }
    }

    // 创建 Figma 节点
    const node: any = {
      name: tagName,
      type: this.getElementType(tagName, computedStyles),
      ...this.getLayoutProperties(computedStyles, viewport),
    };

    // 设置样式
    if (computedStyles.backgroundColor) {
      node.fills = [this.colorToFigma(computedStyles.backgroundColor)];
    }

    if (computedStyles.color && node.type === 'TEXT') {
      node.fills = [this.colorToFigma(computedStyles.color)];
    }

    if (computedStyles.borderRadius) {
      node.cornerRadius = parseFloat(computedStyles.borderRadius);
    }

    if (computedStyles.opacity !== undefined) {
      node.opacity = parseFloat(computedStyles.opacity);
    }

    // 添加子元素
    if (children.length > 0) {
      if (node.type === 'TEXT') {
        // 文本节点合并文本内容
        node.characters = children
          .filter((c) => c.type === 'TEXT')
          .map((c) => c.characters)
          .join('');
      } else {
        node.children = children;
      }
    }

    return node;
  }

  protected getElementType(tagName: string, styles: any): string {
    // SVG 元素
    if (SvgConverter.isSvgElement(tagName)) {
      return 'VECTOR';
    }
    
    // 文本元素
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'label'].includes(tagName)) {
      return 'TEXT';
    }
    
    // 图片元素
    if (tagName === 'img') {
      return 'RECTANGLE'; // 图片在 Figma 中通常是矩形
    }
    
    // 表单元素
    if (['button', 'input', 'textarea', 'select'].includes(tagName)) {
      return 'FRAME';
    }
    
    return 'FRAME';
  }

  protected getLayoutProperties(styles: any, viewport: Viewport): any {
    const props: any = {};

    // 宽度和高度
    if (styles.width) {
      props.width = this.parseSize(styles.width, viewport.width);
    }
    if (styles.height) {
      props.height = this.parseSize(styles.height, viewport.height);
    }

    // Auto Layout
    const display = styles.display || 'block';
    if (display === 'flex') {
      props.layoutMode = styles.flexDirection === 'column' ? 'VERTICAL' : 'HORIZONTAL';
      props.primaryAxisSizingMode = 'AUTO';
      props.counterAxisSizingMode = 'AUTO';
      if (styles.gap) {
        props.itemSpacing = parseFloat(styles.gap);
      }
    }

    // Padding
    if (styles.padding) {
      const padding = this.parsePadding(styles.padding);
      props.paddingLeft = padding.left;
      props.paddingRight = padding.right;
      props.paddingTop = padding.top;
      props.paddingBottom = padding.bottom;
    }

    // Margin (在 Figma 中通过父容器的 spacing 处理)

    return props;
  }

  protected parseCssRules(css: string): Map<string, any> {
    const rules = new Map<string, any>();

    try {
      const ast = parseCss(css);
      if (ast && ast.children) {
        ast.children.forEach((node: any) => {
          if (node.type === 'Rule') {
            const selector = this.selectorToString(node.prelude);
            const declarations: any = {};

            if (node.block && node.block.children) {
              node.block.children.forEach((decl: any) => {
                if (decl.type === 'Declaration') {
                  const property = decl.property;
                  const value = this.valueToString(decl.value);
                  declarations[property] = value;
                }
              });
            }

            if (selector) {
              rules.set(selector, declarations);
            }
          }
        });
      }
    } catch (error) {
      console.warn('CSS 解析失败:', error);
    }

    return rules;
  }

  protected selectorToString(prelude: any): string {
    if (prelude && prelude.children) {
      return prelude.children
        .map((child: any) => {
          if (child.type === 'Selector') {
            return child.children.map((c: any) => c.name || c.value || '').join('');
          }
          return child.name || child.value || '';
        })
        .join(' ');
    }
    return '';
  }

  protected valueToString(value: any): string {
    if (value && value.children) {
      return value.children.map((c: any) => c.value || c.name || '').join(' ');
    }
    return value?.value || value?.name || '';
  }

  protected computeStyles($element: cheerio.Cheerio<cheerio.Element>, cssRules: Map<string, any>, parentStyles: any = {}): any {
    const styles: any = { ...parentStyles };

    // 应用匹配的 CSS 规则
    cssRules.forEach((declarations, selector) => {
      if (this.matchesSelector($element, selector)) {
        Object.assign(styles, declarations);
      }
    });

    // 应用内联样式
    const inlineStyle = $element.attr('style');
    if (inlineStyle) {
      inlineStyle.split(';').forEach((rule) => {
        const [property, value] = rule.split(':').map((s) => s.trim());
        if (property && value) {
          styles[property] = value;
        }
      });
    }

    return styles;
  }

  protected matchesSelector($element: cheerio.Cheerio<cheerio.Element>, selector: string): boolean {
    if (!this.cheerioInstance) {
      return false;
    }
    const element = $element[0];
    if (!element) {
      return false;
    }
    return SelectorMatcher.matches(element, selector, this.cheerioInstance);
  }

  protected parseSize(value: string, maxSize: number): number {
    if (value.endsWith('px')) {
      return parseFloat(value);
    }
    if (value.endsWith('%')) {
      return (parseFloat(value) / 100) * maxSize;
    }
    if (value.endsWith('rem') || value.endsWith('em')) {
      return parseFloat(value) * 16; // 假设基础字体大小为 16px
    }
    return parseFloat(value) || 0;
  }

  protected parsePadding(padding: string): { top: number; right: number; bottom: number; left: number } {
    const values = padding.split(/\s+/).map((v) => parseFloat(v));
    if (values.length === 1) {
      return { top: values[0], right: values[0], bottom: values[0], left: values[0] };
    }
    if (values.length === 2) {
      return { top: values[0], right: values[1], bottom: values[0], left: values[1] };
    }
    if (values.length === 4) {
      return { top: values[0], right: values[1], bottom: values[2], left: values[3] };
    }
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  protected colorToFigma(color: string): any {
    // 解析颜色值（支持 hex, rgb, rgba）
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (color.startsWith('rgb')) {
      const match = color.match(/\d+/g);
      if (match) {
        const r = parseInt(match[0]) / 255;
        const g = parseInt(match[1]) / 255;
        const b = parseInt(match[2]) / 255;
        const a = match[3] ? parseFloat(match[3]) : 1;
        return { r, g, b, a };
      }
    }
    // 默认颜色
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  protected getTextStyle(styles: any): any {
    const fontFamily = styles.fontFamily || 'Inter';
    
    // 使用字体管理器映射字体
    const fontKey = `${fontFamily}-${this.parseFontWeight(styles.fontWeight)}-${styles.fontStyle || 'normal'}`;
    let figmaFont = 'Inter';
    let figmaWeight = 400;
    let figmaStyle = 'normal';

    if (this.fonts.has(fontKey)) {
      const fontInfo = this.fonts.get(fontKey)!;
      const mapping = this.fontManager.mapToFigmaFont(fontInfo);
      figmaFont = mapping.figmaFamily;
      figmaWeight = mapping.figmaWeight;
      figmaStyle = mapping.figmaStyle;
    } else {
      // 尝试直接映射
      const fontInfo: FontInfo = {
        family: fontFamily,
        weight: this.parseFontWeight(styles.fontWeight),
        style: styles.fontStyle || 'normal',
        size: parseFloat(styles.fontSize) || 16,
      };
      const mapping = this.fontManager.mapToFigmaFont(fontInfo);
      figmaFont = mapping.figmaFamily;
      figmaWeight = mapping.figmaWeight;
      figmaStyle = mapping.figmaStyle;
    }

    return {
      fontFamily: figmaFont,
      fontSize: parseFloat(styles.fontSize) || 16,
      fontWeight: figmaWeight,
      fontStyle: figmaStyle,
      lineHeight: this.parseLineHeight(styles.lineHeight),
      letterSpacing: this.parseLetterSpacing(styles.letterSpacing),
    };
  }

  /**
   * 创建图片节点
   */
  protected async createImageNode(
    $img: cheerio.Cheerio<cheerio.Element>,
    image: ImageResource,
    styles: any,
    viewport: Viewport
  ): Promise<any> {
    const width = image.width || this.parseSize($img.attr('width') || '100', viewport.width);
    const height = image.height || this.parseSize($img.attr('height') || '100', viewport.height);

    // 将图片转换为 base64
    const base64 = this.imageProcessor?.imageToBase64(image) || '';

    return {
      type: 'RECTANGLE',
      name: $img.attr('alt') || 'Image',
      width,
      height,
      fills: [
        {
          type: 'IMAGE',
          imageHash: base64, // 在实际应用中，这应该是上传到 Figma 后的哈希
          scaleMode: 'FILL',
        },
      ],
      opacity: styles.opacity ? parseFloat(styles.opacity) : 1,
    };
  }

  protected parseFontWeight(weight: string | undefined): number {
    if (!weight) return 400;
    const w = parseInt(weight);
    if (!isNaN(w)) return w;
    const map: Record<string, number> = {
      normal: 400,
      bold: 700,
      lighter: 300,
      bolder: 700,
    };
    return map[weight.toLowerCase()] || 400;
  }

  protected parseLineHeight(height: string | undefined): any {
    if (!height) return { unit: 'AUTO' };
    if (height === 'normal') return { unit: 'AUTO' };
    if (height.endsWith('px')) {
      return { unit: 'PIXELS', value: parseFloat(height) };
    }
    return { unit: 'PERCENT', value: parseFloat(height) * 100 };
  }

  protected parseLetterSpacing(spacing: string | undefined): any {
    if (!spacing) return { unit: 'PIXELS', value: 0 };
    return { unit: 'PIXELS', value: parseFloat(spacing) || 0 };
  }

  protected extractStyles(cssRules: Map<string, any>): any {
    const textStyles: any = {};
    const colorStyles: any = {};

    // 提取文本样式和颜色样式
    cssRules.forEach((declarations, selector) => {
      if (declarations.color) {
        colorStyles[selector] = {
          name: selector,
          type: 'SOLID',
          color: this.colorToFigma(declarations.color),
        };
      }
    });

    return {
      textStyles,
      colorStyles,
    };
  }
}
