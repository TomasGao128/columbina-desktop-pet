# 哥伦比娅桌宠 · Columbina Desktop Pet

Windows 桌面陪伴应用：完整人物动作、桌面写真与换装、贴边探头、成长互动、天气氛围、小游戏，以及可配置 API 的陪伴聊天和文字助手。

**[下载便携版](https://github.com/TomasGao128/columbina-desktop-pet/releases/latest)** · **[使用说明](docs/USER_GUIDE.md)** · **[更新说明](docs/RELEASE_NOTES.md)**

> 计划发布到 `TomasGao128/columbina-desktop-pet`；若当前仓库仍叫 wonderful，请从当前仓库的 Releases 页面下载。普通用户请选择 windows-x64 完整包，GitHub 自动生成的 Source code 不含素材与运行环境。

## 运行预览

以下均为应用实际运行画面；图片通过 Release 分发，源码仓库不存放人物媒体素材。

![小黑抱抱互动](https://github.com/TomasGao128/columbina-desktop-pet/releases/download/v0.21.0/preview-cat-hug.png)
![夜景陪伴](https://github.com/TomasGao128/columbina-desktop-pet/releases/download/v0.21.0/preview-night-scene.png)
![桌面换装秀](https://github.com/TomasGao128/columbina-desktop-pet/releases/download/v0.21.0/preview-wardrobe.png)
![篮球玩法](https://github.com/TomasGao128/columbina-desktop-pet/releases/download/v0.21.0/preview-basketball.png)
![成长庆祝](https://github.com/TomasGao128/columbina-desktop-pet/releases/download/v0.21.0/preview-level-up.png)
![控制中心](https://github.com/TomasGao128/columbina-desktop-pet/releases/download/v0.21.0/preview-control-center.png)

## 功能

- 完整 PNG/WebP 动作帧，28 种姿势、28 套随成长解锁的换装秀。
- 身体透明度命中、鼠标注视、贴边探头、拖动落地与亲密度升级庆祝。
- 八种天气氛围；小黑互动、风景陪伴，以及做题、节奏、篮球玩法。
- 控制中心、收藏、菜单排序、声音与外观设置。
- 支持 DeepSeek 和兼容 Chat Completions API；陪伴聊天与论文、润色、摘要分开记录。

## 普通用户

1. 下载 Release 中的 `columbina-desktop-pet-v0.21.0-windows-x64.zip`。
2. 完整解压到可写目录，双击 `启动哥伦比娅.vbs`；也可使用 `启动桌宠.cmd`。
3. 右键人物打开菜单，进入「控制中心」调节设置。

无需安装 Node.js、Python 或 npm。聊天需自行填写 API 配置。完整包不带个人配置、存档、聊天记录或密钥。

## 源码结构

```text
app/                 Electron 主进程、服务及 preload
  core/              动作导演、互动规则、命中与聊天策略
  renderer/          HTML、CSS、界面与玩法模块
docs/                使用说明、模块说明与发布记录
tools/               测试、素材校验与发布打包脚本
assets-manifest.json 素材原路径、大小和 SHA-256 清单
package.json         应用入口与开发命令
```

媒体素材与运行环境不进入 Git，发布时分别提供完整便携包与素材包。完整设计 Word 文档包含在便携包的 docs 目录。源码保留当前模块组织，避免改变运行路径；Release 素材包按相同路径补齐 app 下的媒体文件。

## 开发与检查

1. 克隆源码。
2. 下载同版本 `columbina-desktop-pet-v0.21.0-assets.zip`，解压到项目根目录。
3. 从 [Electron v31.7.7 官方发布页](https://github.com/electron/electron/releases/tag/v31.7.7) 下载 `electron-v31.7.7-win32-x64.zip`，解压到 `runtime/`，确认存在 `runtime/electron.exe`。
4. 使用根目录启动器运行；修改代码后重启，无需构建。

```powershell
# 如使用系统 Node.js，可先校验媒体资源
node tools/verify-assets.cjs
# 使用项目附带运行环境执行核心、聊天与完整隔离运行检查
.\tools\verify.cmd
# 使用系统 Node.js 打包到 dist/（需素材、运行环境，已有同名包时会拒绝覆盖）
node tools/build-release.cjs
```

测试使用临时应用副本和本机模拟 API，不访问真实付费 API，也不修改个人存档。用户配置与聊天记录保存在 app 下并被 Git 忽略。不要提交个人 API 配置或记录。

当前尚未实现 Live2D、实时语音或 Steam MOD。项目为非官方同人应用，角色及第三方素材权利归相应权利人；未对这些素材额外授予许可。
