# 第三方组件

慧眼自有代码采用根目录MIT许可证。第三方版权和模型条款继续分别适用。

- iOS本地推理来自OpenBMB/MiniCPM-V-Apps与其llama.cpp-omni分支，固定提交见`ios-native/AccessibleVision/LocalScreening/upstream-provenance.json`及构建脚本。保留的上游MIT版权文本见`ios-native/AccessibleVision/LocalScreening/ThirdParty-NOTICES.txt`，构建时也会复制固定上游LICENSE。
- llama.cpp、ggml及其派生运行库保留各自MIT声明。运行库由固定源构建，不在此仓库分发二进制。
- `@google/genai`、`ws`、`esbuild`与开发依赖`acorn`按各自包内许可证使用，依赖锁文件可复现版本。
- 本地GGUF、视觉投影等模型权重不在仓库中，不由慧眼MIT许可证授权。下载、使用及再分发须遵守模型发布者对应条款。云模型须使用自己的账号并遵守供应商服务条款。
