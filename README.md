# SKL 坐标助手

一个面向 `https://skl.hdu.edu.cn/` 的 Chrome Manifest V3 扩展。它管理预登记的 WGS-84（EPSG:4326）坐标，在目标页面调用 Web Geolocation API 时返回当前选中的坐标，并可按需改写签到请求中的四位 `code` 参数。

当前版本不接管登录，也不处理或绕过阿里云验证码。

## 本地安装

1. 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本仓库根目录。
5. 点击扩展图标，登记 WGS-84 纬度、经度并启用；如需改写请求，可另外填写四位签到码并启用该开关。
6. 重新加载 SKL 签到页面。

## 开发

项目没有运行时第三方依赖，可直接加载源码目录。Node.js 仅用于静态检查和测试：

```bash
npm run verify
```

## 工作方式

- `src/main-world.js` 在页面脚本运行前安装 Geolocation 适配层，并拦截 `fetch` 与 `XMLHttpRequest`。
- 请求改写仅作用于 `/api/ali-nvc/captcha-verify` URL 中已经存在的 `code` 参数。
- `src/content.js` 从 `chrome.storage.local` 读取设置、桥接到页面主执行环境，并在“当前位置”旁显示地点名称。
- `src/background.js` 在位置变化后自动覆盖导出 `Downloads/skl-plugin/config.json`。
- Popup 可以导入手工编辑后的配置；成功导入会再次导出规范化版本。
- `popup/` 提供位置的新增、删除、切换和启停界面。
- 未启用或没有有效坐标时，调用会回退到浏览器原生定位。
- 页面脚本注入范围仅限 `https://skl.hdu.edu.cn/*`。

## 数据与使用边界

坐标保存在本机 Chrome 扩展存储，并同步导出到浏览器下载目录；扩展不会主动上传到其他服务。签到码仅保存在扩展存储中，不写入导出的配置文件。请只在你有权使用的账户、地点和测试场景中使用。

## 路线图

- 地图选点与 WGS-84 坐标登记
- 目标页面状态提示和更清晰的故障诊断
- Chrome 扩展打包与发布流程
