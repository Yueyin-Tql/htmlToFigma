# HTML to Design MCP 使用指南

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建项目

```bash
npm run build
```

### 3. 配置 MCP 客户端

#### 在 Cursor 中配置

在 Cursor 的设置中，找到 MCP 服务器配置，添加：

```json
{
  "mcpServers": {
    "html-to-design": {
      "command": "node",
      "args": ["C:/Users/dell/Desktop/酞青蓝/figmaToDesign/dist/index.js"]
    }
  }
}
```

**注意**：请将路径替换为你的实际项目路径。

#### 在其他 MCP 客户端中配置

根据你的 MCP 客户端文档，配置服务器路径和启动命令。

## 使用示例

### 示例 1: 从网页 URL 导入

```json
{
  "tool": "import_web_to_figma",
  "arguments": {
    "url": "https://example.com",
    "viewport": {
      "width": 1440,
      "height": 900
    },
    "theme": "light",
    "outputPath": "./output/example.figma.json"
  }
}
```

### 示例 2: 从 HTML + CSS 代码导入

```json
{
  "tool": "import_code_to_figma",
  "arguments": {
    "html": "<div class='container'><h1>Hello World</h1><p>这是一个示例页面</p></div>",
    "css": ".container { padding: 20px; background: #f0f0f0; border-radius: 8px; } h1 { color: #333; font-size: 24px; } p { color: #666; }",
    "viewport": {
      "width": 1440,
      "height": 900
    },
    "outputPath": "./output/code.figma.json"
  }
}
```

### 示例 3: 移动端视口

```json
{
  "tool": "import_web_to_figma",
  "arguments": {
    "url": "https://example.com",
    "viewport": {
      "width": 375,
      "height": 812
    },
    "theme": "light"
  }
}
```

### 示例 4: 暗黑主题

```json
{
  "tool": "import_web_to_figma",
  "arguments": {
    "url": "https://example.com",
    "viewport": {
      "width": 1440,
      "height": 900
    },
    "theme": "dark"
  }
}
```

## 生成的 Figma JSON 格式

转换后的 JSON 文件遵循 Figma 的文件格式规范，包含：

- `document`: 文档结构，包含所有页面和图层
- `components`: 组件定义
- `componentSets`: 组件集
- `styles`: 样式定义（文本样式、颜色样式等）

## 导入到 Figma

由于 Figma API 的限制，无法直接通过 API 创建文件。你可以：

### 方法 1: 使用 Figma Plugin

1. 在 Figma 中安装一个可以导入 JSON 的插件
2. 使用插件导入生成的 JSON 文件

### 方法 2: 手动创建

1. 在 Figma 中创建新文件
2. 使用 Figma Plugin API 将 JSON 数据导入

### 方法 3: 使用 Figma REST API（需要开发）

开发一个 Figma Plugin，通过 Plugin API 读取 JSON 并创建图层。

## 常见问题

### Q: 为什么某些样式没有转换？

A: 某些复杂的 CSS 特性（如 Grid、复杂的 Flexbox、动画等）可能无法完美转换。建议：
- 使用标准的 CSS 属性
- 避免使用过于复杂的布局
- 转换后手动调整

### Q: 图片没有显示？

A: 图片需要额外处理。当前版本会保留图片的位置和尺寸，但需要手动添加图片资源。

### Q: 字体不正确？

A: 确保 Figma 中安装了相应的字体，或者使用 Figma 支持的默认字体（如 Inter、Roboto）。

### Q: 如何提高转换质量？

A: 
- 使用语义化的 HTML 结构
- 使用标准的 CSS 属性
- 避免使用 JavaScript 动态生成的内容
- 确保 CSS 选择器简洁明了

## 高级用法

### 批量转换

可以编写脚本批量转换多个网页：

```typescript
import { WebToFigmaConverter } from './src/converters/web-to-figma';

const converter = new WebToFigmaConverter();
const urls = ['https://example.com/page1', 'https://example.com/page2'];

for (const url of urls) {
  const result = await converter.convert(url, {
    viewport: { width: 1440, height: 900 },
    theme: 'light',
  });
  // 保存结果
}
```

### 自定义转换规则

可以扩展 `base-converter.ts` 来自定义转换规则，例如：
- 自定义元素类型映射
- 自定义样式转换
- 添加特殊的布局处理

## 故障排除

### 问题：Puppeteer 无法启动

**解决方案**：
- 确保已安装所有依赖：`npm install`
- 检查系统权限
- 在 Linux 上可能需要安装额外的依赖：`sudo apt-get install -y chromium-browser`

### 问题：网页加载超时

**解决方案**：
- 增加超时时间（在 `web-to-figma.ts` 中修改 `timeout` 参数）
- 检查网络连接
- 某些网站可能阻止自动化访问

### 问题：CSS 解析失败

**解决方案**：
- 检查 CSS 语法是否正确
- 某些 CSS 特性可能不被支持
- 查看控制台错误信息

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！
