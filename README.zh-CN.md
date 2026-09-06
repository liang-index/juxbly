<kbd>[English](README.md)</kbd> · <kbd>**简体中文**</kbd> · <kbd>[日本語](README.ja.md)</kbd> · <kbd>[Português (Brasil)](README.pt-BR.md)</kbd> · <kbd>[Español](README.es.md)</kbd>

# Juxbly

**浏览器即时应用工厂。** 在你正在看的页面上描述你想要什么：结果立刻到手，而产出这个结果的工具会留在原地——下次再访问，它会自己回来。

> 本文档是社区翻译，尽力跟随英文原版，允许滞后；两版不一致时，以 [英文 README](README.md) 为准。

> 状态：**实现前（pre-implementation）**。MV3 骨架可以在 Chrome 中加载，DSL 与其校验层已就位；页面分析、工具、面板与高亮确认尚未构建。V1 刻意不做的事见 [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md)。

<p align="center">
  <img src="docs/assets/screenshots/highlight-confirm.png" width="32.5%" alt="构建流程：描述需求，Juxbly 高亮它将读取的内容，逐字段确认" title="构建：描述 &rarr; 高亮 &rarr; 确认" />
  <img src="docs/assets/screenshots/run-panel-result.png" width="32.5%" alt="运行面板：结果先行呈现，并标注产出它的工具" title="运行：结果优先，附来源" />
  <img src="docs/assets/screenshots/overview-popup.png" width="32.5%" alt="工具栏总览：已保存的工具按最近使用排列，随时自动回来" title="持久化工具，最近使用优先" />
</p>
<p align="center"><sub>原型 UI：描述需求 &rarr; 确认高亮的字段 &rarr; 拿到结果 &rarr; 工具留下，下次自动回来。</sub></p>

---

## 1. 它是什么

Juxbly 是一个开源 Chrome 扩展（Manifest V3）。你在当前页面上用自然语言描述一个需求；模型分析页面，产出一个 **Tool DSL** 配置；你通过页面高亮确认一次，这个工具就被**保存**下来。此后，只要你访问匹配的页面，它就会出现并自己运行。

价值的单位是**工具（Tool）**，不是提示词：

```
发现 → 构建 → 确认 → 保存 → 运行 → 交付 → 健康 → 修复 → 版本 → 复用
```

## 2. 它为什么存在

大多数一次性的网页任务——"把这张表里的价格列抽出来""把这个搜索页里每张结果卡片收集下来""总结这个商品页的评论"——为其写脚本太小题大做，找现成扩展又太具体。

Juxbly 押的不是"把任务跑一次"，而是：

> **把一次性的长尾需求，变成一份拿得走的结果——和一个留在你手里的持久化页面工具。**

结果先行：每次运行都把数据直接摆在你面前，复制 / CSV / JSON 一键即得。工具作为副产物留存，并且直接标注在结果上，你永远知道是什么产出了它——也知道下次它还会在。

这意味着难点不只是生成，还有**失败可见、低成本修复与版本管理**。Juxbly 不承诺工具永不损坏；它承诺的是：损坏的工具会被发现、被解释，并且重建起来很便宜。

## 3. 它为谁而做

- 反复遇到页面级信息任务的开发者与重度用户。
- 批量处理网页的研究者与知识工作者。
- 关注 LLM + DOM 理解、提示注入防御、本地优先浏览器工具的贡献者。

Juxbly **不是**通用聊天侧边栏，**不是**万能爬虫，也**不是**"AI 写并运行 JavaScript"的引擎。明确的边界见 [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md)。

### 哪里好用，哪里吃力

实现前在十个站点样本上测得：

| 页面形态 | 状态 |
|---|---|
| 规则、结构良好的页面与文档 | 可靠——这是 V1 的目标场景 |
| 无限滚动 | 尽力而为 |
| 客户端渲染的 SPA | 尽力而为 |
| 哈希化或自动生成的 class 名 | 尽力而为 |

尽力而为意味着可能好用、也可能不好用。不好用时，Juxbly 会明说，而不是给你一个空结果——这里没有任何"在所有网站上都能用"的承诺。

## 4. 它如何工作

```
Tool DSL（LLM 只产出配置，永不产出代码）
   ↓
Capability Runtime（extract / transform / llm / render / export）
   ↓
Browser Adapter（唯一允许触碰 chrome.* 的地方）
   ↓
Browser APIs
```

- **代码固定，配置可变。** 模型输出 JSON，由白名单解释器执行。整个仓库没有 `eval`、没有 `new Function`、没有任何远程代码加载。
- **确定性工作绝不调用模型。** `extract` / `transform` / `render` 都在本地；只有 `llm` 步骤消耗 token，且输入未变时直接跳过。
- **自带密钥（BYOK）。** 任何 **OpenAI 兼容端点**都可以——OpenAI、OpenRouter、Together，或本地网关（LM Studio、Ollama 的 OpenAI 兼容服务……）——只需设置一次 base URL。页面内容从你的浏览器、经你自己的 API key、发往你自己选定的端点。链路中没有 Juxbly 服务器，也没有遥测。

细节见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 5. 安装（从源码）

```bash
git clone https://github.com/liang-index/juxbly.git
cd juxbly
pnpm install
pnpm dev            # 构建到 .output/chrome-mv3，带 watch
```

然后在 Chrome 中：

1. 打开 `chrome://extensions`。
2. 开启**开发者模式**（Developer mode）。
3. **加载已解压的扩展程序**（Load unpacked）→ 选择 `.output/chrome-mv3`。

首次使用：在任意页面点击悬浮球，描述你想要什么。只有真正需要调用模型的那一刻，Juxbly 才会向你要 API key。

> 骨架可以加载、弹窗可以打开，但都还没接线：页面分析、工具、面板与高亮确认仍在路上。

## 6. 本地开发

| 命令 | 用途 |
|---|---|
| `pnpm install` | 安装 workspace 依赖 |
| `pnpm dev` | 以 watch 模式构建扩展 |
| `pnpm build` | 生产构建 |
| `pnpm typecheck` | 全部包跑 `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest 单元 + 集成 |
| `pnpm test:bench` | 本地 Web 基准（Phase 2+） |

完整的环境搭建、调试与排障：[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

## 7. 测试

```bash
pnpm test                 # 单元（tests/unit）+ 集成（tests/integration）
pnpm test -- --watch      # watch 模式
pnpm test:bench           # Web Corpus + Task Corpus（Phase 2）
```

集成测试用 mock `BrowserAdapter` 和 mock `LlmPort` 对着 fixture HTML 跑真实运行时——不需要 Chrome、不需要网络、不需要 API key。测试范围与回归触发规则：[`docs/testing/TESTING.md`](docs/testing/TESTING.md)。

## 8. 从哪里开始读

| 我想…… | 从这里开始 |
|---|---|
| 理解系统与类型契约 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| 知道各模块负责什么 | [`docs/CODE_MAP.md`](docs/CODE_MAP.md) |
| 读 DSL | `packages/dsl` + [`docs/ARCHITECTURE.md` §5](docs/ARCHITECTURE.md) |
| 新增一个 Capability | [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md) |
| 读设计 Token | [`docs/UI_SPEC.md`](docs/UI_SPEC.md) |
| 知道 V1 不做什么 | [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) |

驱动这套布局的两个指标：**开发者首次成功耗时**与**开发者首次贡献耗时**。

## 9. 贡献

低门槛路径优先：文档、测试、**基准用例**、**Recipe**，然后是 bug 修复，再到小 Capability。核心架构、DSL、权限与安全边界由 maintainer 掌控。

从 [`CONTRIBUTING.md`](CONTRIBUTING.md) 开始，再按贡献类型选指南：

- Capability → [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md)
- Recipe → [`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md)
- 基准用例 → [`docs/contributing/BENCHMARK_GUIDE.md`](docs/contributing/BENCHMARK_GUIDE.md)

## 10. 隐私与安全

- 所有数据都留在 `chrome.storage.local`。无同步、无账号、无遥测——这是开源版的永久立场，不是过渡状态。
- 你的 API key 只在 background service worker 中读取，永不进入 content script、页面上下文或日志。
- 页面内容是不可信输入。模型 prompt 中一律作为*数据*包裹，绝不作为指令。
- 报告漏洞：[`SECURITY.md`](SECURITY.md)。数据处理声明：[`PRIVACY.md`](PRIVACY.md)。

## 11. 文档索引

| 文档 | 角色 |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 类型契约与模块接口 |
| [`docs/UI_SPEC.md`](docs/UI_SPEC.md) | 设计 Token 与组件行为规则 |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | 工程约定与回归规则 |
| [`docs/CODE_MAP.md`](docs/CODE_MAP.md) | 模块 → 职责 → 去哪里看 |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 开发者上手 |
| [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) | V1 刻意不做什么 |
| [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md) | 如何写一个 Capability |
| [`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md) | 如何发布 Recipe |
| [`docs/contributing/BENCHMARK_GUIDE.md`](docs/contributing/BENCHMARK_GUIDE.md) | Web Corpus 基准如何运作 |
| [`docs/testing/TESTING.md`](docs/testing/TESTING.md) | 测试分层与回归触发规则 |
| [`docs/contributing/DOC_CHANGE_PROTOCOL.md`](docs/contributing/DOC_CHANGE_PROTOCOL.md) | 如何变更共享契约 |

每个事实有且只有一个权威来源；其他文档只做引用（[`docs/contributing/DOC_CHANGE_PROTOCOL.md`](docs/contributing/DOC_CHANGE_PROTOCOL.md)）。

## 12. 许可证

代码以 **AGPL-3.0** 授权——见 [`LICENSE`](LICENSE)。

**Juxbly 名称、logo、官方域名与官方 Chrome Web Store 身份不在代码许可证覆盖范围内**，由 [`TRADEMARK.md`](TRADEMARK.md) 中的品牌政策另行约束。
