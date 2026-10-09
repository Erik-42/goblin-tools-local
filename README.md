<div align="center">

# 👺 Goblin Tools 本地版

**当事情显得太大、太复杂时，小精灵帮你一把。**

用 AI 把任务拆解成可执行的小步骤 — 9 个日常效率工具，全部本地运行，数据不出你的电脑。

![Python](https://img.shields.io/badge/Python-3.10+-2e9e6b?logo=python&logoColor=white)
![Dependencies](https://img.shields.io/badge/前端零依赖-HTML%2FCSS%2FJS-f1c40f)
![Platform](https://img.shields.io/badge/Windows-x64-0078d4?logo=windows&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-2e9e6b)
![Privacy](https://img.shields.io/badge/隐私-数据只在你电脑上-blueviolet)

灵感来自 [goblin.tools](https://goblin.tools)（面向 ADHD / 神经多样性人群的任务拆解工具），
完全重写为本机应用：一个 exe 或三个 Python 包即可跑起全部功能。

</div>

## 界面一览

| 首页 · 9 个工具一屏直达 | Magic ToDo · 拆解出可勾选的小步骤 | 设置 · 一次配置任意 OpenAI 兼容模型 |
|---|---|---|
| ![首页](docs/home.png) | ![Magic ToDo](docs/magic-todo.png) | ![设置](docs/settings.png) |

## ✨ 工具集

| 工具 | 干什么用 |
|---|---|
| ✅ **Magic ToDo** | 把「准备一场生日派对」这样的大任务，一键拆成 3~8 个马上能动手的小步骤 |
| ⏯️ **Taskmaster** | 一次屏幕上只出现一个步骤——做完打勾才放下一个，专治任务列表焦虑 |
| ✍️ **Formalizer** | 把随口写的大白话改写成友好 / 专业 / 道歉 / 热情等 7 种语气 |
| ⚖️ **Judge** | 拿不准对方消息的真实态度？贴进来，分析其中隐含的情绪 |
| 🎓 **Professor** | 从「给 6 岁小孩讲」到「专家水平」，四档深度解释任何主题 |
| 💡 **Consultant** | 纠结时列出候选项，逐条摆出利弊并给出建议 |
| ⏱️ **Estimator** | 人总是低估任务时间——它把子任务逐项估给你看，宁高勿低 |
| 🧠 **Compiler** | 把头脑风暴的碎念「编译」成分类清晰的行动项清单 |
| 👨‍ **Chef** | 报出手头食材，生成不用额外买菜的家常食谱 |

ToDo 与 Taskmaster 打通：拆解结果可保存为清单，一键进入「聚焦模式」逐步推进。

## 🚀 快速开始

### 方式一：下载 exe（推荐，免装任何东西）

到 [Releases](../../releases) 下载 `GoblinTools.exe`（约 16 MB，单文件），**双击即用**——
自动在本机启动服务并打开浏览器。关掉控制台窗口即停止。

### 方式二：源码运行

```bash
git clone https://github.com/lwjyzw/goblin-tools-local.git
cd goblin-tools-local
# Windows: 双击 start.bat（首次自动装依赖）
# 手动:
pip install -r requirements.txt
python run.py          # → http://127.0.0.1:8765
```

### 首次使用：配置模型（1 分钟）

打开 <http://127.0.0.1:8765> → 右上角 ⚙️ 设置 → 填入任一家 OpenAI 兼容接口 →
点「测试连通性」→ 完成。

| 服务商 | Base URL | 模型名 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |

## 🔒 隐私

- 除你配置的那一个模型接口外，应用**不与任何第三方通信**——无统计、无埋点、无账户系统
- API 配置存在本机（exe 旁 `goblin-settings.json`）；历史记录与清单只存在浏览器 localStorage
- 手机与电脑同一局域网时，手机浏览器直接访问电脑 IP:8765 也能用（界面已做响应式）

## 🏗️ 技术栈与结构

刻意选零构建步骤的方案：**后端只有 3 个 Python 包，前端没有任何框架**。

```
goblin-app/
├─ GoblinTools.exe        # PyInstaller 单文件产物（不入库，见 Releases）
├─ run.py                 # 入口：起服务 + 自动开浏览器 + 端口占用自动顺延
├─ server/
│  ├─ main.py             # FastAPI 路由 + 静态托管
│  ├─ tools.py            # 9 个工具的提示词模板与 JSON 解析
│  ├─ llm.py              # OpenAI 兼容 chat 客户端（httpx）
│  ├─ paths.py            # 源码 / exe 双模式路径
│  └─ settings_store.py   # 配置读写
├─ web/                   # 原生 HTML/CSS/JS 单页应用（自写 hash 路由）
└─ test/mock_llm.py       # 假模型服务：不花 API 钱跑通端到端测试
```

### 重新打包 exe

```bash
pip install pyinstaller
python -m PyInstaller --noconfirm --onefile --console --name GoblinTools \
  --add-data "web;web" --collect-all uvicorn run.py
# 产物在 dist/GoblinTools.exe
```

### 本地开发

```bash
python -m uvicorn server.main:app --port 8765 --reload   # 改代码即时生效
python test/mock_llm.py                                   # 离线联调用的假模型
```

## 🙏 致谢

- [Goblin Tools](https://goblin.tools) — 产品理念与工具形态的原创者
- FastAPI / uvicorn / httpx / PyInstaller — 让「Python 项目 → 双击 exe」只有 16 MB 的距离

## 📄 License

[MIT](LICENSE)
