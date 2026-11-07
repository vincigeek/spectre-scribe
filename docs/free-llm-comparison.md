# Spectre Scribe 免费 LLM 对照表

核查时间：2026-11-07（周六）中午，北京时间。用途：给 Spectre Scribe 运行时选模型主备。
结论：**主用 Google Gemini 免费版，备选 NVIDIA NIM，AMD 自家网关当第三路（已有 key，零新注册），Groq 当第四路轮换，OpenCode Zen 当补充。**

## 对照表

| 梯队 | 提供方 / 模型 | 免费额度（2026-11-07 核查） | 绑卡 | OpenAI 兼容 | 接入点 |
|---|---|---|---|---|---|
| 主力 | Google Gemini API — `gemini-3.5-flash-lite` | 约 500 请求/天、10 请求/分钟；按请求数算，一整轮（最坏 12 次调用）一天约够 40 轮 | 不用 | 是 | AI Studio 取 key，`generativelanguage.googleapis.com/v1beta/openai/` |
| 备选 | NVIDIA NIM — DeepSeek V4.1 Flash / GLM-5.3 / Kimi K3 等（名单轮换） | 约 40 请求/分钟、约 1 万请求/天（社区实测口径，非官方公布）；对本项目基本等于不限量 | 不用，需手机验证 | 是，`https://integrate.api.nvidia.com/v1` | build.nvidia.com 取 key（`nvapi-` 开头） |
| 已有 | AMD Token Factory 网关（自家）— `amd-deepseek-v41-flash` 等 5 模型互为 fallback | 免费额度按 points 计（非账单）；2026-10-04 实测 fallback 可用 | —（已有 key） | 是，`https://developer.amd.com.cn/radeon/api/v1` | key 已在网关 `.env`，零新注册 |
| 第三 | Groq — `gpt-oss-120b` / `gpt-oss-20b` / `qwen3.8-27b`（每模型独立额度，可轮换） | 每模型 30 请求/分钟、1000 请求/天、200K token/天；token 上限先到，三模型轮换一天约 3 个满负荷整轮 | 不用 | 是，`https://api.groq.com/openai/v1` | console.groq.com 取 key |
| 补充 | OpenCode Zen — `deepseek-v4-flash-free`、`glm-5.3-flash-free` 等 `-free` 后缀模型 | 调用本身 $0；免费名单经常轮换、限时提供 | 注册页核对（见下） | 是，但认证头是 `x-api-key`，不是 `Authorization: Bearer` | `https://opencode.ai/zen/v1`，key 在 opencode.ai/auth 生成（`oc_sk_...`） |

## 每家注意点

- **Gemini**：Google 现在不公布统一的每模型免费限额表，各项目以 AI Studio 限额页（aistudio.google.com/rate-limit）为准；上表 500/天是 2026-10-19 更新的第三方跟踪数字，动手前核对一次自己的项目。Pro 模型 2026 年 4 月起已不在免费层。每日重置为太平洋时间午夜。
- **NVIDIA NIM**：免费层只限原型/开发，不可作生产；免费端点输入可能被用于改进模型，别传敏感内容。手机验证有国家限制，中国号能否验证须实测。模型名单会轮换，跑前拉 `GET /v1/models` 确认。
- **AMD 网关**：本次未查 points 余额余量，接进轮换前看一眼余量。
- **Groq**：Llama 3.1 8B / 3.3 70B 已于 2026-08-16 移出免费层（转 Enterprise），别再按老攻略写。限额按组织算，多开 key 不翻倍。写小说的文笔偏弱，只当量不够时的轮换。
- **OpenCode Zen**：免费模型是“限时提供”，名单会换；个别免费模型可能拿数据改进模型。主聊里提过的“余额至少 $0.50 才放行免费模型”本次搜索未能独立核实，注册时以 opencode.ai/auth 页面的实际要求为准。另注意 OpenCode Go（$10/月，`/zen/go/v1`）是另一个产品，别混用。

## 实现上的坑（Vercel）

- Vercel 免费版函数默认 10 秒、最长 60 秒；一轮 12 次调用串行跑一定超时。按章节 / 按 agent 拆开、走流式、设 `maxDuration`。
- Zen 的认证头要单独处理：服务端 adapter 里把默认的 Bearer 改成 `x-api-key`。

## 待你定

主备定下来后，把 Gemini + NIM + AMD 三路接进轮换，key 按老规矩由你提供/确认；Zen 要不要现在注册拿 key（卡在绑卡那步会停下请示）。
