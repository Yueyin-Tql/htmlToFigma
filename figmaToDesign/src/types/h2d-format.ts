/**
 * .h2d 文件格式类型定义
 * 用于浏览器扩展捕获的网页数据格式
 */

export interface H2DFile {
  version: string;
  html: string;
  css: string;
  resources: H2DResources;
  viewport: H2DViewport;
  metadata: H2DMetadata;
}

export interface H2DResources {
  images: H2DImage[];
  fonts: H2DFont[];
  stylesheets?: string[];
  scripts?: string[];
}

export interface H2DImage {
  url: string;
  data: string; // base64 编码的图片数据
  mimeType: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface H2DFont {
  family: string;
  weight: number;
  style: string;
  src?: string; // 字体文件 URL 或 base64
  format?: string; // woff, woff2, ttf 等
}

export interface H2DViewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface H2DMetadata {
  url: string;
  title?: string;
  description?: string;
  timestamp: string;
  userAgent?: string;
  theme?: 'light' | 'dark';
  interactions?: H2DInteraction[];
  animations?: H2DAnimation[];
}

export interface H2DInteraction {
  selector: string;
  state: 'hover' | 'focus' | 'active' | 'visited';
  styles: Record<string, string>;
  screenshot?: string; // base64 截图
}

export interface H2DAnimation {
  name: string;
  selector: string;
  duration: number;
  timingFunction: string;
  keyframes?: H2DKeyframe[];
}

export interface H2DKeyframe {
  offset: number;
  properties: Record<string, string>;
}

/**
 * 验证 H2D 文件格式
 */
export function validateH2DFile(data: any): data is H2DFile {
  return (
    typeof data === 'object' &&
    typeof data.version === 'string' &&
    typeof data.html === 'string' &&
    typeof data.css === 'string' &&
    typeof data.resources === 'object' &&
    typeof data.viewport === 'object' &&
    typeof data.metadata === 'object' &&
    Array.isArray(data.resources.images) &&
    Array.isArray(data.resources.fonts) &&
    typeof data.viewport.width === 'number' &&
    typeof data.viewport.height === 'number' &&
    typeof data.metadata.url === 'string' &&
    typeof data.metadata.timestamp === 'string'
  );
}

/**
 * 创建默认 H2D 文件
 */
export function createDefaultH2DFile(url: string, viewport: H2DViewport): H2DFile {
  return {
    version: '1.0',
    html: '',
    css: '',
    resources: {
      images: [],
      fonts: [],
      stylesheets: [],
      scripts: [],
    },
    viewport,
    metadata: {
      url,
      timestamp: new Date().toISOString(),
      theme: 'light',
    },
  };
}
