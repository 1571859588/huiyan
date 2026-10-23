# 谷歌主动提醒的有限接回

2026-10-23：普通慧眼仍在3.5秒释放筛图等待、4秒中止请求。3.5—4秒间完成的原结果可通过同一个处理函数接回；必须仍属于同一会话和合同，且没有更新的有效结果覆盖。新阴性结果也能淘汰旧阳性结果。停止、后台和媒体释放后不接回。不新增模型请求，不改变找东西、导航和音频交付规则。服务端仅对active_reminder放行4秒内结果，画面年龄由客户端自己的时钟检查。

普通直连generateContent及直连Live共用按合同缓存的prepare资料，换合同序号、模型、池或传输方式即失效，60秒刷新，失败不缓存。本地1B及35B实验不参与此次改动。

`realtime_image.lifecycle`的`late_result_recovered`表示结果交给原应用处理，不代表命中或实际音频交付。服务端`late_result_forwarded`也不代表手机接受。3.5秒超时及后续接回是同一请求的不同阶段，统计需按requestId去重。

运行`node tools/test-reminder-grace.cjs`及`node tools/test-prepare-cache.cjs`做无付费请求的时序与缓存回归。`tests/core-source-hashes.json`仅有意更新runGeminiActiveReminderTick的基线；其余19个成熟核心函数不变。此次未重新验收手机听感。
