# CLAUDE.md

此檔案提供 Claude Code（claude.ai/code）在此專案中操作時的參考指引。

## 重要前提

**所有工具、套件、模型的選擇，必須以開源免費為原則。** 避免引入需要付費授權、或商業使用有爭議的工具（包含 npm 套件、二進位工具、AI 模型等）。如果有多個選項，優先選擇 Apache 2.0、MIT、GPL 等明確開源授權的方案。

## 常用指令

```bash
npm run dev        # 啟動開發伺服器（Vite HMR）
npm run build      # tsc 型別檢查 + Vite 生產環境建置
npm run lint       # ESLint 檢查
npm run preview    # 本地預覽生產環境建置結果
npx tsc --noEmit   # 僅執行型別檢查，不產生輸出
```

## 架構說明

**路由** — 使用 `react-router-dom` v6 的 `BrowserRouter`。`App.tsx` 內部的 `AppRoutes` 元件定義所有路由，頁面對應如下：`/` → Home、`/link` → Link、`/chat` → Chat、`/tts` → Tts。頁面切換使用 `useNavigate`，子頁面返回首頁透過 `onBack` prop 傳入 `() => navigate('/')`。

**跨頁狀態** — `App.tsx` 同時持有 `root: TreeItem[]`，即 `Link.tsx` 的完整連結／資料夾樹狀結構，這是唯一提升至 App 層的狀態。`Chat.tsx` 與 `Tts.tsx` 的所有狀態均由元件自身管理。

**各頁說明**

| 檔案 | 功能 |
|---|---|
| `Home.tsx` | 卡片式導覽頁。`NAV_ITEMS` 陣列驅動卡片格線：帶有 `page` 屬性（路由路徑字串）的項目執行內部導航（`useNavigate`），帶有 `href` 的項目開啟外部連結，帶有 `disabled` 的項目顯示為 Coming Soon。目前卡片：01 管理連結、02 LLM 問答。（TTS 卡片已暫時移除，`Tts.tsx` 保留備用） |
| `Link.tsx` | 階層式連結管理頁。使用遞迴的 `TreeItem`（`LinkItem` / `FolderItem` 的辨別聯合型別）樹狀結構。五個純函式 tree helpers（`treeAdd`、`treeUpdate`、`treeDelete`、`getChildrenAtPath`、`buildBreadcrumbs`）定義於元件外部。樹內導航使用 `navPath: string[]`（從根節點到當前資料夾的 ID 陣列）。支援匯出目前連結樹為 `links.json`。 |
| `Chat.tsx` | OpenAI 問答介面。透過 SSE 串流呼叫 `gpt-4o-mini`。支援圖片（base64 vision）與 PDF（使用 `pdfjs-dist` 在 client 端提取文字）作為問答上下文。支援匯出 markdown 表格為 CSV。 |
| `Tts.tsx` | 中文文字轉語音頁面（暫未掛載於首頁）。左側 sidebar 顯示模型狀態與聲線選單（可收折），主區域含文字輸入卡（支援上傳 `.txt`）與語音輸出卡（HTML5 audio player + 下載 WAV）。透過輪詢 `/api/tts/status` 等待模型就緒。 |

**後端（server.js）** — Node.js 內建 HTTP server（無 express），ESM。除了服務靜態檔案外，提供：
- `GET/POST /api/links` — 讀寫 `data/links.json`（Docker volume 持久化）
- `GET /api/tts/status` — proxy 至 Python TTS API `/health`，回傳 `{ ready, initializing, error }`
- `GET /api/tts/speakers` — proxy 至 Python TTS API `/speakers`，回傳聲線列表
- `POST /api/tts` — proxy 至 Python TTS API `/tts`，接收 `{ text, speakerId }`，回傳 WAV binary

**TTS 引擎** — 由外部 Python TTS API server 提供，Node.js 透過 HTTP proxy 呼叫。API base URL 由環境變數 `PYTHON_TTS_URL` 設定（預設 `http://host.docker.internal:14000`）。Timeout：status/speakers 5 秒，合成 120 秒。

**Python TTS API 介面**（Node.js 呼叫的端點）：
- `GET /health` → `{ ready, loading, error }`
- `GET /speakers` → `[{ id, name }]`
- `POST /tts` body: `{ text, speaker_id, speed, format }` → WAV binary

**主題切換** — 每個頁面各自管理 `isDark` 布林值，由固定位置的按鈕切換。深色／亮色類別（`.home-root.light`、`.link-root.light`、`.chat-root.light`、`.tts-root.light`）會覆寫各元件根元素上定義的 CSS 變數。字型：`Noto Sans TC`、`Cormorant Garamond`、`DM Mono`，透過 Google Fonts 載入（定義於 `index.html`）。

**新增頁面**

1. 建立 `Page.tsx` 與 `Page.css`
2. 在 `App.tsx` 的 `AppRoutes` 中新增 `<Route path="/xxx" element={<Page onBack={goHome} />} />`
3. 在 `Home.tsx` 的 `NAV_ITEMS` 中新增一張卡片，`page` 屬性填入路由路徑（不含 `/`）

**新增首頁導覽卡片**

`NAV_ITEMS` 中的每個項目需包含 `index`（顯示用數字字串）、`name`、`description`，以及以下三者之一：`page`（路由路徑字串，對應 `/<page>`）、`href`（外部連結）、`disabled: true`（停用）。

## 部署

**建置 Docker image**
```bash
docker build -t link-center:latest .
```

**設定（編輯 `.env`）**
```
UI_PORT=3000
PYTHON_TTS_URL=http://host.docker.internal:14000
```

**啟動容器**
```bash
docker-compose up -d
```

**停止容器**
```bash
docker-compose down
```

**持久化資料目錄**

| 本機路徑 | 容器路徑 | 用途 |
|---|---|---|
| `./data/` | `/app/data/` | links.json（連結樹資料） |

遷移時搬運 `data/` 目錄即可無痛移植。
