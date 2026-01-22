import { FigmaConverter } from './base-converter.js';

export interface CodeConversionOptions {
  viewport: {
    width: number;
    height: number;
  };
}

export class CodeToFigmaConverter extends FigmaConverter {
  async convert(html: string, css: string, options: CodeConversionOptions): Promise<any> {
    try {
      // 将 HTML 和 CSS 组合成完整的文档
      const fullHtml = this.combineHtmlAndCss(html, css);
      
      // 转换为 Figma 格式
      return await this.htmlToFigma(fullHtml, css, options.viewport);
    } catch (error) {
      throw new Error(`代码转换失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private combineHtmlAndCss(html: string, css: string): string {
    // 如果 HTML 已经包含完整的文档结构，直接添加样式
    if (html.includes('<html') || html.includes('<!DOCTYPE')) {
      if (css && !html.includes('<style>')) {
        const styleTag = `<style>\n${css}\n</style>`;
        if (html.includes('<head>')) {
          return html.replace('</head>', `${styleTag}\n</head>`);
        } else {
          return html.replace('<html', `<html><head>${styleTag}</head>`);
        }
      }
      return html;
    }

    // 否则创建完整的 HTML 文档
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
${css}
  </style>
</head>
<body>
${html}
</body>
</html>`;
  }
}
