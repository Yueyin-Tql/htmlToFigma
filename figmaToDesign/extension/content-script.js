// 内容脚本：在网页上下文中运行

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture') {
    capturePage(request.config)
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 异步响应
  }
});

async function capturePage(config) {
  const h2dData = {
    version: '1.0',
    html: document.documentElement.outerHTML,
    css: extractAllStyles(),
    resources: {
      images: config.includeImages ? await extractImages() : [],
      fonts: config.includeFonts ? extractFonts() : [],
      stylesheets: extractStylesheets(),
      scripts: extractScripts(),
    },
    viewport: config.viewport,
    metadata: {
      url: window.location.href,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      theme: config.theme,
      interactions: config.includeInteractions ? extractInteractions() : [],
    },
  };

  return h2dData;
}

function extractAllStyles() {
  const styles = [];

  // 提取所有样式表
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      Array.from(sheet.cssRules).forEach((rule) => {
        if (rule instanceof CSSStyleRule || rule instanceof CSSMediaRule) {
          styles.push(rule.cssText);
        }
      });
    } catch (e) {
      // 跨域样式表可能无法访问
    }
  });

  // 提取内联样式
  document.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style');
    if (style) {
      styles.push(`${el.tagName.toLowerCase()} { ${style} }`);
    }
  });

  return styles.join('\n');
}

async function extractImages() {
  const images = [];

  // 提取 <img> 标签
  document.querySelectorAll('img').forEach((img) => {
    if (img.src) {
      images.push({
        url: img.src,
        alt: img.alt || '',
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
      });
    }
  });

  // 提取 CSS background-image
  const allElements = document.querySelectorAll('*');
  allElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none' && bgImage.startsWith('url(')) {
      const match = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (match && match[1] && !match[1].startsWith('data:')) {
        images.push({
          url: match[1],
          alt: '',
          width: el.clientWidth || 0,
          height: el.clientHeight || 0,
        });
      }
    }
  });

  // 转换为 base64（简化版，实际应该下载图片）
  const imageData = [];
  for (const img of images) {
    try {
      const base64 = await imageToBase64(img.url);
      imageData.push({
        url: img.url,
        data: base64,
        mimeType: getMimeType(img.url),
        width: img.width,
        height: img.height,
        alt: img.alt,
      });
    } catch (error) {
      console.warn('图片转换失败:', img.url, error);
    }
  }

  return imageData;
}

function imageToBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function getMimeType(url) {
  if (url.startsWith('data:')) {
    const match = url.match(/data:([^;]+);/);
    return match ? match[1] : 'image/png';
  }
  const ext = url.split('.').pop()?.toLowerCase();
  const mimeTypes = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
  };
  return mimeTypes[ext] || 'image/png';
}

function extractFonts() {
  const fonts = new Set();
  const fontData = [];

  const allElements = document.querySelectorAll('*');
  allElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const fontFamily = style.fontFamily;
    const fontWeight = style.fontWeight;
    const fontStyle = style.fontStyle;

    if (fontFamily && fontFamily !== 'initial' && fontFamily !== 'inherit') {
      const firstFont = fontFamily.split(',')[0].trim().replace(/["']/g, '');
      const key = `${firstFont}-${fontWeight}-${fontStyle}`;
      
      if (!fonts.has(key)) {
        fonts.add(key);
        fontData.push({
          family: firstFont,
          weight: parseFontWeight(fontWeight),
          style: fontStyle,
        });
      }
    }
  });

  return fontData;
}

function parseFontWeight(weight) {
  const weightMap = {
    normal: 400,
    bold: 700,
    lighter: 300,
    bolder: 700,
  };
  return weightMap[weight] || parseInt(weight) || 400;
}

function extractStylesheets() {
  const stylesheets = [];
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    if (link.href) {
      stylesheets.push(link.href);
    }
  });
  return stylesheets;
}

function extractScripts() {
  const scripts = [];
  document.querySelectorAll('script[src]').forEach((script) => {
    if (script.src) {
      scripts.push(script.src);
    }
  });
  return scripts;
}

function extractInteractions() {
  const interactions = [];
  
  // 提取 CSS 中的伪类规则
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      Array.from(sheet.cssRules).forEach((rule) => {
        if (rule instanceof CSSStyleRule) {
          const selector = rule.selectorText;
          const state = detectPseudoClass(selector);
          if (state) {
            const styles = {};
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              styles[prop] = rule.style.getPropertyValue(prop);
            }
            interactions.push({
              selector,
              state,
              styles,
            });
          }
        }
      });
    } catch (e) {
      // 跨域样式表可能无法访问
    }
  });

  return interactions;
}

function detectPseudoClass(selector) {
  if (selector.includes(':hover')) return 'hover';
  if (selector.includes(':focus')) return 'focus';
  if (selector.includes(':active')) return 'active';
  if (selector.includes(':visited')) return 'visited';
  return null;
}
