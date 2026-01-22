// 弹出窗口逻辑

document.addEventListener('DOMContentLoaded', () => {
  const captureBtn = document.getElementById('capture-btn');
  const statusDiv = document.getElementById('status');
  const progressDiv = document.getElementById('progress');
  const viewportWidth = document.getElementById('viewport-width');
  const viewportHeight = document.getElementById('viewport-height');
  const themeSelect = document.getElementById('theme');
  const includeImages = document.getElementById('include-images');
  const includeFonts = document.getElementById('include-fonts');
  const includeInteractions = document.getElementById('include-interactions');

  captureBtn.addEventListener('click', async () => {
    try {
      // 显示进度
      statusDiv.classList.add('hidden');
      progressDiv.classList.remove('hidden');
      captureBtn.disabled = true;

      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('无法获取当前标签页');
      }

      // 获取配置
      const config = {
        viewport: {
          width: parseInt(viewportWidth.value) || 1440,
          height: parseInt(viewportHeight.value) || 900,
        },
        theme: themeSelect.value,
        includeImages: includeImages.checked,
        includeFonts: includeFonts.checked,
        includeInteractions: includeInteractions.checked,
      };

      // 发送捕获消息
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'capture',
        config,
      });

      if (response.success) {
        // 保存文件
        const h2dData = response.data;
        const filename = `capture-${Date.now()}.h2d`;
        
        const blob = new Blob([JSON.stringify(h2dData, null, 2)], {
          type: 'application/json',
        });

        const url = URL.createObjectURL(blob);
        await chrome.downloads.download({
          url,
          filename,
          saveAs: true,
        });

        URL.revokeObjectURL(url);

        // 显示成功消息
        showStatus('success', '页面已成功捕获并保存！');
      } else {
        throw new Error(response.error || '捕获失败');
      }
    } catch (error) {
      console.error('捕获失败:', error);
      showStatus('error', `错误: ${error.message}`);
    } finally {
      progressDiv.classList.add('hidden');
      captureBtn.disabled = false;
    }
  });
});

function showStatus(type, message) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove('hidden');

  if (type === 'success') {
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
  }
}
