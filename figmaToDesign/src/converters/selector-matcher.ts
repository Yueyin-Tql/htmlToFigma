import * as cheerio from 'cheerio';
import { selectOne, selectAll } from 'css-select';

/**
 * 增强的 CSS 选择器匹配器
 * 使用 css-select 库支持复杂选择器
 */
export class SelectorMatcher {
  /**
   * 检查元素是否匹配选择器
   */
  static matches(element: cheerio.Element, selector: string, $: cheerio.CheerioAPI): boolean {
    try {
      // 使用 css-select 进行匹配
      const result = selectOne(selector, [element], {
        adapter: this.createCheerioAdapter($),
      });
      return result !== null;
    } catch (error) {
      // 如果选择器解析失败，回退到简单匹配
      return this.simpleMatch(element, selector, $);
    }
  }

  /**
   * 查找所有匹配选择器的元素
   */
  static findAll(selector: string, $root: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): cheerio.Cheerio<cheerio.Element> {
    try {
      const elements = selectAll(selector, $root.toArray(), {
        adapter: this.createCheerioAdapter($),
      });
      return $(elements);
    } catch (error) {
      // 回退到 cheerio 的简单选择
      return $root.find(selector);
    }
  }

  /**
   * 创建 cheerio 适配器供 css-select 使用
   */
  private static createCheerioAdapter($: cheerio.CheerioAPI): any {
    return {
      isTag: (node: any) => node && node.type === 'tag',
      getName: (node: any) => (node.type === 'tag' ? node.tagName : null),
      getParent: (node: any) => {
        const $node = $(node);
        const parent = $node.parent()[0];
        return parent || null;
      },
      getSiblings: (node: any) => {
        const $node = $(node);
        const parent = $node.parent();
        if (parent.length === 0) return [node];
        return parent.children().toArray();
      },
      getChildren: (node: any) => {
        const $node = $(node);
        return $node.children().toArray();
      },
      getAttributeValue: (node: any, name: string) => {
        const $node = $(node);
        return $node.attr(name) || null;
      },
      hasAttrib: (node: any, name: string) => {
        const $node = $(node);
        return $node.attr(name) !== undefined;
      },
      findOne: (selector: string, nodes: any[]) => {
        const $nodes = $(nodes);
        const result = $nodes.find(selector).first()[0];
        return result || null;
      },
      findAll: (selector: string, nodes: any[]) => {
        const $nodes = $(nodes);
        return $nodes.find(selector).toArray();
      },
    };
  }

  /**
   * 简单匹配（回退方案）
   */
  private static simpleMatch(element: cheerio.Element, selector: string, $: cheerio.CheerioAPI): boolean {
    const $element = $(element);

    // ID 选择器
    if (selector.startsWith('#')) {
      const id = selector.slice(1).split(/[\s,>+~[.:]/)[0];
      return $element.attr('id') === id;
    }

    // 类选择器
    if (selector.startsWith('.')) {
      const className = selector.slice(1).split(/[\s,>+~[.:]/)[0];
      return $element.hasClass(className);
    }

    // 标签选择器
    if (selector.match(/^[a-z]+$/i)) {
      return $element.is(selector);
    }

    // 属性选择器
    const attrMatch = selector.match(/^\[([^\]]+)\]$/);
    if (attrMatch) {
      const attr = attrMatch[1];
      if (attr.includes('=')) {
        const [name, value] = attr.split('=').map((s) => s.trim().replace(/["']/g, ''));
        return $element.attr(name) === value;
      } else {
        return $element.attr(attr) !== undefined;
      }
    }

    return false;
  }

  /**
   * 解析选择器优先级（用于样式优先级计算）
   */
  static getSelectorSpecificity(selector: string): number {
    let specificity = 0;

    // ID 选择器
    const idMatches = selector.match(/#/g);
    if (idMatches) specificity += idMatches.length * 1000;

    // 类选择器、属性选择器、伪类
    const classMatches = selector.match(/[.:\[]/g);
    if (classMatches) specificity += classMatches.length * 100;

    // 标签选择器
    const tagMatches = selector.match(/^[a-z]+|(?<=[\s>+~])[a-z]+/gi);
    if (tagMatches) specificity += tagMatches.length;

    return specificity;
  }
}
