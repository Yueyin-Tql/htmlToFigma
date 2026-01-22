import * as cheerio from 'cheerio';
import { parseSVG } from 'svg-parser';

export interface SvgNode {
  type: 'VECTOR' | 'GROUP';
  name: string;
  fills?: any[];
  strokes?: any[];
  strokeWeight?: number;
  children?: SvgNode[];
  vectorPaths?: any[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  opacity?: number;
}

/**
 * SVG 转换器
 * 将 SVG 元素转换为 Figma VECTOR 节点
 */
export class SvgConverter {
  /**
   * 转换 SVG 元素为 Figma 节点
   */
  static convertSvgElement($svg: cheerio.Cheerio<cheerio.Element>): SvgNode | null {
    const svgElement = $svg[0];
    if (!svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
      return null;
    }

    try {
      const svgHtml = $svg.html() || '';
      const svgString = `<svg>${svgHtml}</svg>`;
      const parsed = parseSVG(svgString);

      const node: SvgNode = {
        type: 'VECTOR',
        name: 'SVG',
        children: [],
      };

      // 获取 SVG 属性
      const width = this.parseLength($svg.attr('width') || '100');
      const height = this.parseLength($svg.attr('height') || '100');
      const viewBox = $svg.attr('viewBox');

      if (width && height) {
        node.width = width;
        node.height = height;
      }

      // 处理 viewBox
      if (viewBox) {
        const [x, y, w, h] = viewBox.split(/\s+|,/).map(parseFloat);
        if (w && h) {
          node.width = w;
          node.height = h;
          node.x = x || 0;
          node.y = y || 0;
        }
      }

      // 处理填充和描边
      const fill = $svg.attr('fill') || '#000000';
      const stroke = $svg.attr('stroke');
      const strokeWidth = $svg.attr('stroke-width');

      if (fill && fill !== 'none') {
        node.fills = [this.parseColor(fill)];
      }

      if (stroke && stroke !== 'none') {
        node.strokes = [this.parseColor(stroke)];
        node.strokeWeight = strokeWidth ? parseFloat(strokeWidth) : 1;
      }

      // 处理透明度
      const opacity = $svg.attr('opacity');
      if (opacity) {
        node.opacity = parseFloat(opacity);
      }

      // 转换子元素
      if (parsed.children && parsed.children.length > 0) {
        node.children = this.convertSvgChildren(parsed.children);
      }

      // 如果有路径，转换为向量路径
      const paths = this.extractPaths($svg);
      if (paths.length > 0) {
        node.vectorPaths = paths;
      }

      return node;
    } catch (error) {
      console.warn('SVG 转换失败:', error);
      // 返回一个简单的矩形作为占位符
      return {
        type: 'VECTOR',
        name: 'SVG',
        width: 100,
        height: 100,
        fills: [{ r: 0.8, g: 0.8, b: 0.8, a: 1 }],
      };
    }
  }

  /**
   * 转换 SVG 子元素
   */
  private static convertSvgChildren(children: any[]): SvgNode[] {
    const result: SvgNode[] = [];

    for (const child of children) {
      if (child.type === 'element') {
        const node = this.convertSvgChildElement(child);
        if (node) {
          result.push(node);
        }
      }
    }

    return result;
  }

  /**
   * 转换单个 SVG 子元素
   */
  private static convertSvgChildElement(element: any): SvgNode | null {
    const tagName = element.tagName?.toLowerCase();

    if (!tagName) {
      return null;
    }

    const node: SvgNode = {
      type: tagName === 'g' ? 'GROUP' : 'VECTOR',
      name: tagName.toUpperCase(),
    };

    // 处理属性
    const props = element.properties || {};

    if (props.fill && props.fill !== 'none') {
      node.fills = [this.parseColor(props.fill)];
    }

    if (props.stroke && props.stroke !== 'none') {
      node.strokes = [this.parseColor(props.stroke)];
      node.strokeWeight = props['stroke-width'] ? parseFloat(props['stroke-width']) : 1;
    }

    if (props.opacity) {
      node.opacity = parseFloat(props.opacity);
    }

    // 处理路径元素
    if (tagName === 'path' && props.d) {
      node.vectorPaths = [this.pathToVectorPath(props.d)];
    }

    // 处理矩形
    if (tagName === 'rect') {
      node.width = props.width ? parseFloat(props.width) : 0;
      node.height = props.height ? parseFloat(props.height) : 0;
      node.x = props.x ? parseFloat(props.x) : 0;
      node.y = props.y ? parseFloat(props.y) : 0;
    }

    // 处理圆形
    if (tagName === 'circle') {
      const r = props.r ? parseFloat(props.r) : 0;
      node.width = r * 2;
      node.height = r * 2;
      node.x = (props.cx ? parseFloat(props.cx) : 0) - r;
      node.y = (props.cy ? parseFloat(props.cy) : 0) - r;
    }

    // 处理子元素
    if (element.children && element.children.length > 0) {
      node.children = this.convertSvgChildren(element.children);
    }

    return node;
  }

  /**
   * 提取 SVG 路径
   */
  private static extractPaths($svg: cheerio.Cheerio<cheerio.Element>): any[] {
    const paths: any[] = [];

    $svg.find('path').each((_, el) => {
      const $path = $svg.find(el);
      const d = $path.attr('d');
      if (d) {
        paths.push(this.pathToVectorPath(d));
      }
    });

    return paths;
  }

  /**
   * 将 SVG 路径转换为 Figma 向量路径
   */
  private static pathToVectorPath(pathData: string): any {
    // 简化的路径转换
    // Figma 使用特定的路径格式，这里返回基本结构
    return {
      path: pathData,
      windingRule: 'NONZERO', // 或 'EVENODD'
    };
  }

  /**
   * 解析长度值（支持 px, em, % 等）
   */
  private static parseLength(value: string): number | null {
    if (!value) return null;

    const num = parseFloat(value);
    if (isNaN(num)) return null;

    // 如果是百分比，需要上下文，这里简化处理
    if (value.includes('%')) {
      return null; // 需要父元素尺寸
    }

    return num;
  }

  /**
   * 解析颜色值
   */
  private static parseColor(color: string): any {
    // 处理 hex 颜色
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }

    // 处理 rgb/rgba
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

    // 处理命名颜色（简化版）
    const namedColors: Record<string, any> = {
      black: { r: 0, g: 0, b: 0, a: 1 },
      white: { r: 1, g: 1, b: 1, a: 1 },
      red: { r: 1, g: 0, b: 0, a: 1 },
      green: { r: 0, g: 1, b: 0, a: 1 },
      blue: { r: 0, g: 0, b: 1, a: 1 },
    };

    if (namedColors[color.toLowerCase()]) {
      return namedColors[color.toLowerCase()];
    }

    // 默认黑色
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  /**
   * 检测元素是否为 SVG
   */
  static isSvgElement(tagName: string): boolean {
    return tagName.toLowerCase() === 'svg';
  }

  /**
   * 检测 CSS background-image 中的 SVG
   */
  static extractSvgFromBackground(backgroundImage: string): string | null {
    if (backgroundImage.startsWith('url("data:image/svg+xml')) {
      const match = backgroundImage.match(/url\(["']?data:image\/svg\+xml[^"')]+["']?\)/);
      if (match) {
        return match[0].replace(/url\(["']?/, '').replace(/["']?\)$/, '');
      }
    }
    return null;
  }
}
