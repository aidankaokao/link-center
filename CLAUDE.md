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
| `Home.tsx` | 卡片式導覽頁。`NAV_ITEMS` 陣列驅動卡片格線：帶有 `page` 屬性（路由路徑字串）的項目執行內部導航（`useNavigate`），帶有 `href` 的項目開啟外部連結，帶有 `disabled` 的項目顯示為 Coming Soon。目前卡片：01 頁面連結、02 LLM 問答。（TTS 卡片已暫時移除，`Tts.tsx` 保留備用） |
| `Link.tsx` | 階層式連結管理頁，頁面標題「頁面連結」。使用遞迴的 `TreeItem`（`LinkItem` / `FolderItem` 的辨別聯合型別）樹狀結構。`FolderItem` 支援可選 `password?: string` 欄位；有密碼的資料夾在進入、編輯、刪除時會彈出密碼驗證 modal，卡片右下角顯示鎖頭圖示。五個純函式 tree helpers（`treeAdd`、`treeUpdate`、`treeDelete`、`getChildrenAtPath`、`buildBreadcrumbs`）定義於元件外部。樹內導航使用 `navPath: string[]`（從根節點到當前資料夾的 ID 陣列）。 |
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

## 介面風格基準

新增頁面時請遵循以下設計規範，確保視覺一致性。

### 色彩系統

每個頁面在根元素（`{page}-root`）上定義 CSS 變數，深色為預設，亮色以 `.light` 覆寫：

| 變數 | 深色 | 亮色 | 用途 |
|------|------|------|------|
| `--bg` | `#050d1a` | `#eef3fb` | 頁面背景 |
| `--surface` | `rgba(255,255,255,0.13)` | `#ffffff` | 卡片／面板底色 |
| `--border` | `rgba(255,255,255,0.18)` | `#c8d8f0` | 邊框 |
| `--text` | `#e8e4dc` | `#0e1f3d` | 主要文字 |
| `--muted` | `#6b7a90` | `#6e82a4` | 次要文字／placeholder |
| `--gold` | `#c8a96e` | `#9a6f30` | 強調色（accent） |
| `--gold-dim` | `#8a7249` | `#b8924a` | 淡化強調色 |
| `--input-bg` | `rgba(255,255,255,0.07)` | `#f4f7fd` | 輸入框底色 |
| `--input-border` | `rgba(255,255,255,0.14)` | `#c0d0ec` | 輸入框邊框 |
| `--input-focus` | `rgba(200,169,110,0.5)` | `#9a6f30` | 輸入框 focus 邊框 |
| `--btn-primary` | `#c8a96e` | `#0e1f3d` | 主要按鈕底色 |
| `--btn-primary-text` | `#0a0a0a` | `#ffffff` | 主要按鈕文字 |
| `--danger` | `#e05c5c` | `#c94040` | 錯誤／危險 |
| `--danger-hover` | `rgba(224,92,92,0.12)` | `rgba(201,64,64,0.08)` | 錯誤背景 |

### 背景漸層

所有頁面使用相同的背景：

```css
/* 深色 */
background:
  radial-gradient(ellipse 70% 50% at 15% 10%, rgba(40,100,200,0.18) 0%, transparent 60%),
  radial-gradient(ellipse 55% 45% at 85% 88%, rgba(20,60,150,0.15) 0%, transparent 55%),
  linear-gradient(160deg, #0b1f40 0%, #050d1c 50%, #091528 100%);

/* 亮色 */
background:
  radial-gradient(ellipse 70% 50% at 15% 10%, rgba(100,160,255,0.18) 0%, transparent 60%),
  radial-gradient(ellipse 55% 45% at 85% 88%, rgba(60,120,220,0.10) 0%, transparent 55%),
  linear-gradient(160deg, #ddeaff 0%, #eef3fb 50%, #d8e8ff 100%);
```

### 字型

| 字型 | 用途 |
|------|------|
| `Noto Sans TC`, `Microsoft JhengHei` | 主要內文、中文、標題 |
| `DM Mono` | 標籤、索引數字、代碼、說明文字 |
| `Cormorant Garamond` | 裝飾性大標（首頁） |

### 版面結構

**子頁面（有 sidebar）：**
```css
.{page}-root {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
```
- 左側 sidebar：寬 260px，收折後 52px，`backdrop-filter: blur(12px)`
- 右側 main：`flex: 1`，垂直排列 topbar + 內容區

**子頁面（無 sidebar，如 Link）：**
```css
.{page}-root {
  min-height: 100vh;
}
```

### 元件規格

**Topbar**
- 高度：56px，`backdrop-filter: blur(12px)`
- 左側：圖示（gold 色）+ 頁面標題，`font-size: 15px; font-weight: 700; letter-spacing: 0.06em`
- 右側：控制按鈕群組（`gap: 6px`）
- 底部邊框：`1px solid var(--border)`

**Topbar 控制按鈕（主題切換、返回首頁等）**
```css
width: 34px; height: 34px;
border-radius: 8px;
border: 1px solid var(--border);
background: var(--input-bg);
color: var(--muted);
/* hover */ color: var(--gold); border-color: var(--gold-dim); transform: scale(1.08);
```

**Sidebar 收折按鈕**
```css
width: 28px; height: 28px;
border-radius: 6px;
border: 1px solid var(--sidebar-border);
/* hover */ color: var(--gold); border-color: var(--gold-dim); background: rgba(200,169,110,0.08);
```

**主要按鈕（Primary）**
```css
background: var(--btn-primary);
color: var(--btn-primary-text);
border-radius: 8–10px;
/* hover */ opacity: 0.85; transform: translateY(-1px) 或 scale(1.06);
/* disabled */ opacity: 0.3; cursor: not-allowed;
```

**輸入框**
```css
background: var(--input-bg);
border: 1px solid var(--input-border);
border-radius: 8px;
padding: 9px 12px;
font-size: 14px;
/* focus */ border-color: var(--input-focus);
```

**錯誤提示**
```css
color: var(--danger);
background: var(--danger-hover);
border: 1px solid var(--danger);
border-radius: 8px;
padding: 8px 14px;
font-size: 13px; letter-spacing: 0.04em;
```

**狀態指示點**
```css
width: 6px; height: 6px; border-radius: 50%;
/* ok */      background: var(--status-ok);  box-shadow: 0 0 6px rgba(76,175,125,0.5);
/* loading */ background: var(--gold);
/* error */   background: var(--danger);
```

**Sidebar 區塊標題**
```css
font-size: 12px; font-weight: 700;
letter-spacing: 0.18em; text-transform: uppercase;
color: var(--muted);
```

### 動畫

```css
/* 元素進場 */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;

/* 漸入 */
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* 通用 transition easing（有彈性感） */
transition: ... 0.3s cubic-bezier(0.16, 1, 0.3, 1);
```

### SVG 圖示

所有圖示使用 inline SVG（`viewBox="0 0 24 24"`），`fill="none"`、`stroke="currentColor"`、`strokeWidth="1.8"`、`strokeLinecap="round"`、`strokeLinejoin="round"`，尺寸透過父元素的 `width/height` 控制。不引入外部 icon library。

### 新頁面 CSS 範本

```css
/* ── Dark theme (default) ── */
.{page}-root {
  --bg: #050d1a; --surface: rgba(255,255,255,0.13); --border: rgba(255,255,255,0.18);
  --text: #e8e4dc; --muted: #6b7a90; --gold: #c8a96e; --gold-dim: #8a7249;
  --input-bg: rgba(255,255,255,0.07); --input-border: rgba(255,255,255,0.14);
  --input-focus: rgba(200,169,110,0.5); --btn-primary: #c8a96e; --btn-primary-text: #0a0a0a;
  --danger: #e05c5c; --danger-hover: rgba(224,92,92,0.12);
}
/* ── Light theme ── */
.{page}-root.light {
  --bg: #eef3fb; --surface: #ffffff; --border: #c8d8f0;
  --text: #0e1f3d; --muted: #6e82a4; --gold: #9a6f30; --gold-dim: #b8924a;
  --input-bg: #f4f7fd; --input-border: #c0d0ec; --input-focus: #9a6f30;
  --btn-primary: #0e1f3d; --btn-primary-text: #ffffff;
  --danger: #c94040; --danger-hover: rgba(201,64,64,0.08);
}
```

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
