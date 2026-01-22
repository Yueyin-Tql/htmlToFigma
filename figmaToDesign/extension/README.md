# HTML to Design 浏览器扩展

## 安装

1. 打开 Chrome/Edge 浏览器
2. 访问 `chrome://extensions/` 或 `edge://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `extension` 目录

## 使用

1. 访问要捕获的网页
2. 点击扩展图标
3. 配置视口大小和选项
4. 点击"捕获页面"
5. 保存 .h2d 文件

## 文件说明

- `manifest.json` - 扩展配置文件
- `popup.html` - 弹出窗口 HTML
- `popup.js` - 弹出窗口逻辑
- `content-script.js` - 内容脚本（在网页中运行）
- `background.js` - 后台服务工作者
- `styles.css` - 扩展样式

## 注意事项

- 需要图标文件：`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- 某些网站可能阻止内容脚本执行
- 跨域资源可能无法完全捕获
