# htmlToFigma
基于 Model Context Protocol (MCP) 的服务器，可将网页 URL、HTML/CSS 代码转换为 Figma 设计稿，功能对标 html.to.design。 核心功能：支持从网页 URL、HTML/CSS 代码或浏览器扩展捕获文件导入；自动转换 SVG、图片和字体；提取 CSS 动画和交互状态；支持自定义视口和主题切换。 技术架构：基于 TypeScript 和 Node.js，使用 Puppeteer 渲染网页，支持 CSS Flexbox 自动转换为 Figma Auto Layout。 应用场景：快速将网页或代码转换为 Figma 设计稿，适用于设计评审、竞品分析等场景。可与支持 MCP 的客户端（如 Cursor IDE）无缝集成。
