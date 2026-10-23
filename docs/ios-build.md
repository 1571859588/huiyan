# iOS、自建授权和本地模型

需要macOS、Xcode 16.4、XcodeGen、Git、Python3、Node/npm和ripgrep；设备部署需要自己的苹果开发签名。模型文件不进Git，下载由模型管理入口按catalog完成，模型许可另行遵守。

1. 在仓库根目录执行`npm ci`。
2. 执行`node tools/setup-local.cjs`生成全新的本地授权。它不读取原项目账号，拒绝覆盖已有材料；生成的服务器配置及两份原生JSON均已忽略。
3. 修改`ios-native/project.yml`中的两个服务HTTPS地址、Bundle ID和自己的开发团队。服务器配置来自对应`providers/*/private-client-access/config.json`，云Key放相应`.env`。
4. 在`ios-native/ScreenShareBuild`执行`npm ci`及`node build.cjs`，生成隔离屏幕共享运行时。
5. 返回仓库根目录，构建固定本地推理库与桥：

```sh
RUNNER_TEMP="$(mktemp -d)" bash .github/scripts/build-local-screen35b.sh
```

6. 在`ios-native`执行`xcodegen generate`，用Xcode打开生成工程，选择自己的团队和iPhone后构建运行。大内存权限是否被签名实际授予需以设备结果为准，写在entitlements里不等于系统一定批准。

本地35B与1B入口沿用阿里页，1B的声音与复核实际为Google手机直连。默认35B缓存开启。不要为测试改掉系统提示、top-8或关闭内存失败释放，以免把假速度当提升。

服务器默认本机监听，需要自己的HTTPS反向代理。iOS首次加载前向自己的服务器自动授权并获取HttpOnly Cookie；普通网页不能靠伪造User-Agent或查询参数获得原生权限。没有配置原生材料时拒绝原生付费/直连接入是预期，不应把它改成公开泄露Key。

本仓库不提供Apple账号、签名服务、设备配对文件或原运营服务邀请码。新的贡献者可先运行离线检查，不必配置云Key或手机。本地速度复现方法见`docs/local-inference.md`。
