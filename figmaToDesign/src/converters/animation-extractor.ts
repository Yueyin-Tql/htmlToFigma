import { Page } from 'puppeteer';
import { parse as parseCss } from 'css-tree';

export interface AnimationInfo {
  name: string;
  duration: number;
  timingFunction: string;
  delay: number;
  iterationCount: string;
  direction: string;
  fillMode: string;
  keyframes?: KeyframeRule[];
}

export interface KeyframeRule {
  offset: number;
  properties: Record<string, string>;
}

export interface InteractionState {
  selector: string;
  state: 'hover' | 'focus' | 'active' | 'visited';
  styles: Record<string, string>;
  screenshot?: string; // base64 截图
}

/**
 * 动画提取器
 * 提取 CSS 动画、过渡和交互状态
 */
export class AnimationExtractor {
  private keyframes: Map<string, KeyframeRule[]> = new Map();
  private animations: Map<string, AnimationInfo> = new Map();
  private interactions: InteractionState[] = [];

  /**
   * 从 CSS 中提取动画信息
   */
  extractFromCss(css: string): void {
    try {
      const ast = parseCss(css);
      if (ast && ast.children) {
        ast.children.forEach((node: any) => {
          // 提取 @keyframes
          if (node.type === 'Atrule' && node.name === 'keyframes') {
            this.extractKeyframes(node);
          }

          // 提取 animation 属性
          if (node.type === 'Rule') {
            this.extractAnimationProperties(node);
          }
        });
      }
    } catch (error) {
      console.warn('CSS 动画提取失败:', error);
    }
  }

  /**
   * 提取 @keyframes 规则
   */
  private extractKeyframes(node: any): void {
    const name = this.getKeyframeName(node);
    const keyframes: KeyframeRule[] = [];

    if (node.block && node.block.children) {
      node.block.children.forEach((rule: any) => {
        if (rule.type === 'Rule') {
          const offset = this.parseKeyframeOffset(rule.prelude);
          const properties: Record<string, string> = {};

          if (rule.block && rule.block.children) {
            rule.block.children.forEach((decl: any) => {
              if (decl.type === 'Declaration') {
                const property = decl.property;
                const value = this.valueToString(decl.value);
                properties[property] = value;
              }
            });
          }

          keyframes.push({ offset, properties });
        }
      });
    }

    this.keyframes.set(name, keyframes);
  }

  /**
   * 获取关键帧名称
   */
  private getKeyframeName(node: any): string {
    if (node.prelude && node.prelude.children) {
      return node.prelude.children
        .map((child: any) => child.name || child.value || '')
        .join('');
    }
    return 'unnamed';
  }

  /**
   * 解析关键帧偏移量
   */
  private parseKeyframeOffset(prelude: any): number {
    if (prelude && prelude.children) {
      const text = prelude.children
        .map((child: any) => child.value || child.name || '')
        .join('');

      if (text === 'from' || text === '0%') {
        return 0;
      }
      if (text === 'to' || text === '100%') {
        return 1;
      }

      const percentMatch = text.match(/(\d+)%/);
      if (percentMatch) {
        return parseFloat(percentMatch[1]) / 100;
      }
    }
    return 0;
  }

  /**
   * 提取动画属性
   */
  private extractAnimationProperties(node: any): void {
    const selector = this.selectorToString(node.prelude);
    let animationName = '';
    let duration = 0;
    let timingFunction = 'ease';
    let delay = 0;
    let iterationCount = '1';
    let direction = 'normal';
    let fillMode = 'none';

    if (node.block && node.block.children) {
      node.block.children.forEach((decl: any) => {
        if (decl.type === 'Declaration') {
          const property = decl.property;
          const value = this.valueToString(decl.value);

          if (property === 'animation' || property === 'animation-name') {
            animationName = value.split(/\s+/)[0];
          } else if (property === 'animation-duration') {
            duration = this.parseDuration(value);
          } else if (property === 'animation-timing-function') {
            timingFunction = value;
          } else if (property === 'animation-delay') {
            delay = this.parseDuration(value);
          } else if (property === 'animation-iteration-count') {
            iterationCount = value;
          } else if (property === 'animation-direction') {
            direction = value;
          } else if (property === 'animation-fill-mode') {
            fillMode = value;
          }
        }
      });
    }

    if (animationName) {
      this.animations.set(selector, {
        name: animationName,
        duration,
        timingFunction,
        delay,
        iterationCount,
        direction,
        fillMode,
        keyframes: this.keyframes.get(animationName),
      });
    }
  }

  /**
   * 从页面提取交互状态
   */
  async extractInteractionStates(page: Page): Promise<InteractionState[]> {
    const interactions: InteractionState[] = [];

    // 提取 CSS 中的伪类规则
    const cssRules = await page.evaluate(() => {
      const rules: Array<{
        selector: string;
        state: string;
        styles: Record<string, string>;
      }> = [];

      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule) => {
            if (rule instanceof CSSStyleRule) {
              const selector = rule.selectorText;
              const state = this.detectPseudoClass(selector);
              if (state) {
                const styles: Record<string, string> = {};
                for (let i = 0; i < rule.style.length; i++) {
                  const prop = rule.style[i];
                  styles[prop] = rule.style.getPropertyValue(prop);
                }
                rules.push({ selector, state, styles });
              }
            }
          });
        } catch (e) {
          // 跨域样式表可能无法访问
        }
      });

      return rules;
    });

    // 为每个交互状态创建截图
    for (const rule of cssRules) {
      try {
        const screenshot = await this.captureInteractionState(page, rule.selector, rule.state);
        interactions.push({
          selector: rule.selector,
          state: rule.state as any,
          styles: rule.styles,
          screenshot,
        });
      } catch (error) {
        console.warn(`捕获交互状态失败: ${rule.selector}`, error);
        interactions.push({
          selector: rule.selector,
          state: rule.state as any,
          styles: rule.styles,
        });
      }
    }

    this.interactions = interactions;
    return interactions;
  }

  /**
   * 检测伪类
   */
  private static detectPseudoClass(selector: string): string | null {
    if (selector.includes(':hover')) return 'hover';
    if (selector.includes(':focus')) return 'focus';
    if (selector.includes(':active')) return 'active';
    if (selector.includes(':visited')) return 'visited';
    return null;
  }

  /**
   * 捕获交互状态截图
   */
  private async captureInteractionState(
    page: Page,
    selector: string,
    state: string
  ): Promise<string | undefined> {
    try {
      // 移除伪类选择器
      const baseSelector = selector.replace(/:(hover|focus|active|visited)/g, '');

      // 触发交互状态
      await page.evaluate((sel, st) => {
        const element = document.querySelector(sel);
        if (element) {
          if (st === 'hover') {
            element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          } else if (st === 'focus') {
            (element as HTMLElement).focus();
          } else if (st === 'active') {
            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          }
        }
      }, baseSelector, state);

      // 等待样式应用
      await page.waitForTimeout(100);

      // 截图
      const element = await page.$(baseSelector);
      if (element) {
        const screenshot = await element.screenshot({ encoding: 'base64' });
        return `data:image/png;base64,${screenshot}`;
      }
    } catch (error) {
      console.warn(`截图失败: ${selector}`, error);
    }
    return undefined;
  }

  /**
   * 检测 JavaScript 动画
   */
  async detectJavaScriptAnimations(page: Page): Promise<AnimationInfo[]> {
    const animations: AnimationInfo[] = [];

    const jsAnimations = await page.evaluate(() => {
      const results: Array<{
        element: string;
        property: string;
        from: string;
        to: string;
      }> = [];

      // 检测使用 requestAnimationFrame 的动画
      // 检测使用 setInterval/setTimeout 的动画
      // 这里简化处理，实际需要更复杂的检测逻辑

      return results;
    });

    // 转换为 AnimationInfo 格式
    jsAnimations.forEach((anim) => {
      animations.push({
        name: `js-${anim.element}-${anim.property}`,
        duration: 0, // JavaScript 动画持续时间难以检测
        timingFunction: 'linear',
        delay: 0,
        iterationCount: '1',
        direction: 'normal',
        fillMode: 'none',
      });
    });

    return animations;
  }

  /**
   * 将动画信息转换为 Figma 组件变体
   */
  toFigmaVariants(): any[] {
    const variants: any[] = [];

    // 为每个交互状态创建变体
    this.interactions.forEach((interaction) => {
      variants.push({
        name: `${interaction.selector} (${interaction.state})`,
        properties: {
          State: interaction.state,
        },
        styles: interaction.styles,
        screenshot: interaction.screenshot,
      });
    });

    return variants;
  }

  /**
   * 获取动画元数据（用于 Figma 插件）
   */
  getAnimationMetadata(): any {
    return {
      animations: Array.from(this.animations.entries()).map(([selector, info]) => ({
        selector,
        ...info,
      })),
      interactions: this.interactions,
      keyframes: Object.fromEntries(this.keyframes),
    };
  }

  /**
   * 辅助方法：选择器转字符串
   */
  private selectorToString(prelude: any): string {
    if (prelude && prelude.children) {
      return prelude.children
        .map((child: any) => child.name || child.value || '')
        .join('');
    }
    return '';
  }

  /**
   * 辅助方法：值转字符串
   */
  private valueToString(value: any): string {
    if (value && value.children) {
      return value.children.map((c: any) => c.value || c.name || '').join(' ');
    }
    return value?.value || value?.name || '';
  }

  /**
   * 解析持续时间（支持 s, ms）
   */
  private parseDuration(value: string): number {
    const num = parseFloat(value);
    if (value.includes('ms')) {
      return num / 1000; // 转换为秒
    }
    return num;
  }
}
