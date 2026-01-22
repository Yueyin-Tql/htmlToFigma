import { Page } from 'puppeteer';

export interface FontInfo {
  family: string;
  weight: number;
  style: string;
  size: number;
}

export interface FigmaFontMapping {
  figmaFamily: string;
  figmaWeight: number;
  figmaStyle: string;
}

/**
 * 字体管理器
 * 负责检测字体、映射到 Figma 支持的字体
 */
export class FontManager {
  // Web 字体到 Figma 字体的映射表
  private static readonly FONT_MAPPING: Record<string, string> = {
    // 系统字体
    'arial': 'Arial',
    'helvetica': 'Helvetica',
    'times': 'Times New Roman',
    'times new roman': 'Times New Roman',
    'courier': 'Courier New',
    'courier new': 'Courier New',
    'verdana': 'Verdana',
    'georgia': 'Georgia',
    'palatino': 'Palatino',
    'garamond': 'Garamond',
    'bookman': 'Bookman',
    'comic sans ms': 'Comic Sans MS',
    'trebuchet ms': 'Trebuchet MS',
    'arial black': 'Arial Black',
    'impact': 'Impact',

    // Google Fonts 常见映射
    'roboto': 'Roboto',
    'open sans': 'Open Sans',
    'lato': 'Lato',
    'montserrat': 'Montserrat',
    'raleway': 'Raleway',
    'poppins': 'Poppins',
    'source sans pro': 'Source Sans Pro',
    'oswald': 'Oswald',
    'ubuntu': 'Ubuntu',
    'playfair display': 'Playfair Display',
    'merriweather': 'Merriweather',
    'pt sans': 'PT Sans',
    'pt serif': 'PT Serif',
    'droid sans': 'Droid Sans',
    'droid serif': 'Droid Serif',

    // 中文字体映射
    'microsoft yahei': 'Microsoft YaHei',
    'simsun': 'SimSun',
    'simhei': 'SimHei',
    'kaiti': 'KaiTi',
    'fangsong': 'FangSong',
    'pingfang sc': 'PingFang SC',
    'hiragino sans gb': 'Hiragino Sans GB',
    'wenquanyi micro hei': 'WenQuanYi Micro Hei',
  };

  // Figma 支持的字体列表（常见字体）
  private static readonly FIGMA_FONTS = [
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Courier New',
    'Verdana',
    'Georgia',
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Inter',
    'Poppins',
    'Source Sans Pro',
  ];

  /**
   * 从页面检测所有使用的字体
   */
  async detectFonts(page: Page): Promise<Map<string, FontInfo>> {
    const fonts = new Map<string, FontInfo>();

    const fontData = await page.evaluate(() => {
      const results: Array<{
        family: string;
        weight: string;
        style: string;
        size: string;
        element: string;
      }> = [];

      const allElements = document.querySelectorAll('*');
      allElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        const family = style.fontFamily;
        const weight = style.fontWeight;
        const fontStyle = style.fontStyle;
        const fontSize = style.fontSize;

        if (family && family !== 'initial' && family !== 'inherit') {
          // 提取第一个字体（处理字体回退）
          const firstFont = family.split(',')[0].trim().replace(/["']/g, '');
          results.push({
            family: firstFont,
            weight,
            style: fontStyle,
            size: fontSize,
            element: el.tagName.toLowerCase(),
          });
        }
      });

      return results;
    });

    // 去重并存储
    fontData.forEach((data) => {
      const key = `${data.family}-${data.weight}-${data.style}`;
      if (!fonts.has(key)) {
        fonts.set(key, {
          family: data.family,
          weight: this.parseFontWeight(data.weight),
          style: data.style,
          size: parseFloat(data.size) || 16,
        });
      }
    });

    return fonts;
  }

  /**
   * 映射 Web 字体到 Figma 字体
   */
  mapToFigmaFont(fontInfo: FontInfo): FigmaFontMapping {
    const normalizedFamily = fontInfo.family.toLowerCase().trim();
    
    // 查找映射
    let figmaFamily = FontManager.FONT_MAPPING[normalizedFamily];
    
    // 如果没有直接映射，尝试模糊匹配
    if (!figmaFamily) {
      figmaFamily = this.fuzzyMatchFont(normalizedFamily);
    }

    // 如果还是找不到，使用默认字体
    if (!figmaFamily) {
      figmaFamily = 'Inter'; // Figma 默认字体
    }

    // 映射字体样式
    const figmaStyle = fontInfo.style === 'italic' ? 'italic' : 'normal';

    // 映射字体粗细
    let figmaWeight = fontInfo.weight;
    // Figma 支持的字体粗细：100, 200, 300, 400, 500, 600, 700, 800, 900
    if (figmaWeight < 100) figmaWeight = 100;
    if (figmaWeight > 900) figmaWeight = 900;
    // 四舍五入到最接近的 100
    figmaWeight = Math.round(figmaWeight / 100) * 100;

    return {
      figmaFamily,
      figmaWeight,
      figmaStyle,
    };
  }

  /**
   * 模糊匹配字体
   */
  private fuzzyMatchFont(family: string): string | null {
    // 检查是否包含已知字体名称
    for (const [webFont, figmaFont] of Object.entries(FontManager.FONT_MAPPING)) {
      if (family.includes(webFont) || webFont.includes(family)) {
        return figmaFont;
      }
    }

    // 检查是否在 Figma 支持的字体列表中
    for (const figmaFont of FontManager.FIGMA_FONTS) {
      if (family.toLowerCase().includes(figmaFont.toLowerCase())) {
        return figmaFont;
      }
    }

    return null;
  }

  /**
   * 解析字体粗细
   */
  private parseFontWeight(weight: string | number): number {
    if (typeof weight === 'number') {
      return weight;
    }

    const weightStr = weight.toString().toLowerCase();
    const weightMap: Record<string, number> = {
      'normal': 400,
      'bold': 700,
      'lighter': 300,
      'bolder': 700,
      '100': 100,
      '200': 200,
      '300': 300,
      '400': 400,
      '500': 500,
      '600': 600,
      '700': 700,
      '800': 800,
      '900': 900,
    };

    return weightMap[weightStr] || 400;
  }

  /**
   * 处理字体回退链
   * 例如: "Roboto, Arial, sans-serif" -> ["Roboto", "Arial", "sans-serif"]
   */
  parseFontFamily(fontFamily: string): string[] {
    return fontFamily
      .split(',')
      .map((f) => f.trim().replace(/["']/g, ''))
      .filter((f) => f && f !== 'serif' && f !== 'sans-serif' && f !== 'monospace' && f !== 'cursive' && f !== 'fantasy');
  }

  /**
   * 生成 Figma 文本样式名称
   */
  generateTextStyleName(fontInfo: FontInfo, mapping: FigmaFontMapping): string {
    const weightName = this.getWeightName(mapping.figmaWeight);
    const styleName = mapping.figmaStyle === 'italic' ? 'Italic' : '';
    return `${mapping.figmaFamily} ${weightName}${styleName}`.trim();
  }

  /**
   * 获取字体粗细名称
   */
  private getWeightName(weight: number): string {
    const weightNames: Record<number, string> = {
      100: 'Thin',
      200: 'ExtraLight',
      300: 'Light',
      400: 'Regular',
      500: 'Medium',
      600: 'SemiBold',
      700: 'Bold',
      800: 'ExtraBold',
      900: 'Black',
    };
    return weightNames[weight] || 'Regular';
  }

  /**
   * 添加自定义字体映射
   */
  static addFontMapping(webFont: string, figmaFont: string) {
    FontManager.FONT_MAPPING[webFont.toLowerCase()] = figmaFont;
  }
}
