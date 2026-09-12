# 问题日志

## CR-001：文字稿加载会干扰 YouTube 字幕开关

- 日期：2026-09-12
- 状态：已解决
- 现象或修改背景：CaptionRoll 需要用户手动打开播放器字幕后才能稳定显示文字稿，并可能改变用户原有的字幕开关或字幕轨道设置。
- 原因分析：页面钩子为了诱发 timed-text 请求，主动调用了播放器内部的 captions `setOption` 和 `reload`，使文字稿加载与播放器 CC 状态耦合。
- 解决方案：直接使用播放器响应中英文轨道的 `baseUrl` 加载文字稿，保留对用户自然产生的 timed-text 请求的捕获作为备用，但不再写入播放器字幕选项。
- 验证方式：回归测试确认页面钩子不再调用 captions `setOption/loadModule`；真实 Edge 全新配置中未手动打开 CC，扩展直接读取到英文轨道并显示 4 条字幕。
- 相关文件：`page-hook.js`、`tests/page-hook.test.js`
