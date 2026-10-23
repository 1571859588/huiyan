# 慧眼 Huiyan

**面向视障者的实时视觉助手。把成熟的交互流程开源，邀请社区一起找到准确率、速度和支出更平衡的模型方案。**

Huiyan is an accessible visual assistant for blind and low-vision users. We welcome contributions on low-latency multimodal inference, reliable tool execution, on-device screening and affordable upstream providers.

发起者张振宇是一名视障钢琴调律师，也是实际使用者。项目从真实生活任务反复试用中形成，核心原则是：接受模型不完美，不接受应用逻辑失控。

## 本次开放什么

| 功能 | 已有流程 |
| --- | --- |
| 普通问答 | 根据当前画面和对话回答，必要时只读搜索 |
| 主动提醒 | 用户授权建立合同，持续筛图，命中后播报，真实声音交付后完成或去重 |
| 找东西 | 锁定目标、相对位置和走近引导、原生手部/深度协作及完成释放 |
| 持续播报 | 按用户关注点简短描述最新画面，保持任务和声音生命周期 |

包含Google、阿里两套各自实际运行过的实现，以及iOS原生相机、音频、屏幕共享和MiniCPM本地实验。**教学、课程素材、专家课程规则及教学机位组件不在此仓库中。导航不是本次开放功能。** 少量导航共用代码和隐藏DOM保留用于兼容成熟前端，导航API与入口关闭，不是可用导航产品。

当前1B默认分工已恢复为“本地1B粗筛 → 触发后Google Lite完整审核 → 原慧眼Live播报”，均保留手机直连。之前由Live直接复核并决定发声的实验源码仍保留供研究，但当前入口不再加载或激活它。

成熟指应用流程已有真实使用记录，不表示任何模型在所有场景都识别正确，也不表示两套供应商效果相同。本地方案已跑通合同到提醒的链路，但仍是实验，主要未决项是准确率、尾延迟和资源支出。

## 快速开始

需要Node.js 20或以上。先克隆本仓库，再在仓库根目录执行：

```sh
npm ci
```

1. 复制`providers/google/.env.example`为同目录`.env`，填自己的Google Key和账号实际可用的模型名。
2. 执行`npm run start:google`，浏览器打开`http://localhost:8787`。
3. 阿里方案使用`providers/aliyun/.env.example`，执行`npm run start:aliyun`。网页默认保留原权限边界；阿里声音、本地实验和手机直连需要下述自建原生授权。

Windows终端若遇执行策略限制，使用`npm.cmd`。两个服务默认端口相同，分别运行；同时运行时在各自`.env`设置不同`PORT`。启动不需要高德Key。手机访问应使用自己的HTTPS域名反向代理，不能直接把局域网HTTP当作Safari摄像头测试入口。

模型名是原系统当时的配置记录，不保证对所有账号开放；请按自己的账号设置。源码默认不含Key。Google普通网页使用服务器转接，苹果保留受控的直连研究方案；失败不会偷偷改用付费阿里。

```sh
npm run check
npm test
node tools/run-native-checks.cjs
```

以上检查不调用收费模型。iOS和本地模型构建、授权及离线对照见[原生构建说明](docs/ios-build.md)。模型不随仓库下载，也不提供带私人签名的IPA。

## 从哪里读代码

- [结构与模型分工](docs/architecture.md)：四种功能、合同和媒体生命周期、供应商接入位置。
- [本地实验与真实计时](docs/local-inference.md)：35B与1B的分工、有效和失败的优化、复现方式。
- [协作任务与验收口径](CONTRIBUTING.md)：欢迎从底层优化，避免增加重复视觉复核和无谓模型调用。
- [当前已知限制](docs/status.md)：已验证范围及仍需真机测试的部分。
- [私密材料边界](SECURITY.md)与[第三方许可证](THIRD_PARTY_NOTICES.md)。

目录中的`providers/google`、`providers/aliyun`故意保留各自实现。先让工程师能对照真实流程，不为开源把两端强行合并重写。`source-provenance.json`记录来源提交和原始文件哈希；公开分发版仅做必要的模块排除、配置脱敏及独立启动适配，不直接等同于生产部署包。

## 最需要的帮助

1. 找到兼顾视觉准确率、稳定首响和长期费用的上游组合，比较忙时尾延迟，而不只看单次最快结果。
2. 优化35B单图prefill的大量专家权重读取和GPU流水，保留原权重、路由和识别质量。
3. 改善小模型对结果成立、新实例和连续变化的判断，同时减少云端重复复核。
4. 保持VoiceOver可用、自然插话和不重复播报；结果必须以实际播放的声音交付为准。

欢迎通过Issue和PR参与，尤其欢迎模型与移动推理工程师。项目采用MIT许可证；模型权重和第三方组件另按各自条款使用。
