// 后台服务工作者

chrome.runtime.onInstalled.addListener(() => {
  console.log('HTML to Design Capture 扩展已安装');
});

// 处理下载完成事件
chrome.downloads.onChanged.addListener((downloadDelta) => {
  if (downloadDelta.state && downloadDelta.state.current === 'complete') {
    console.log('文件下载完成:', downloadDelta.id);
  }
});
