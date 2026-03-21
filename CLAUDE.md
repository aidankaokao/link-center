# CLAUDE.md

此檔案提供 Claude Code（claude.ai/code）在此專案中操作時的參考指引。

## 常用指令

```bash
npm run dev        # 啟動開發伺服器（Vite HMR）
npm run build      # tsc 型別檢查 + Vite 生產環境建置
npm run lint       # ESLint 檢查
npm run preview    # 本地預覽生產環境建置結果
npx tsc --noEmit   # 僅執行型別檢查，不產生輸出
```

## 架構說明

**路由** — 本專案不使用 React Router。`App.tsx` 持有 `page: 'home' | 'link' | 'chat'` 狀態，透過條件式 return 一次渲染一個頁面。頁面切換採用 callback 傳遞（`onNavigate`、`onBack`）。

**跨頁狀態** — `App.tsx` 同時持有 `root: TreeItem[]`，即 `Link.tsx` 的完整連結／資料夾樹狀結構，這是唯一提升至 App 層的狀態。`Chat.tsx` 的所有狀態均由元件自身管理。

**各頁說明**

| 檔案 | 功能 |
|---|---|
| `Home.tsx` | 卡片式導覽頁。`NAV_ITEMS` 陣列驅動卡片格線：帶有 `page` 屬性的項目執行內部導航，帶有 `href` 的項目開啟外部連結，帶有 `disabled` 的項目顯示為 Coming Soon。目前卡片：01 管理連結、02 LLM 問答、03 即將推出。 |
| `Link.tsx` | 階層式連結管理頁。使用遞迴的 `TreeItem`（`LinkItem` / `FolderItem` 的辨別聯合型別）樹狀結構。五個純函式 tree helpers（`treeAdd`、`treeUpdate`、`treeDelete`、`getChildrenAtPath`、`buildBreadcrumbs`）定義於元件外部。樹內導航使用 `navPath: string[]`（從根節點到當前資料夾的 ID 陣列）。 |
| `Chat.tsx` | OpenAI 問答介面。透過 SSE 串流呼叫 `gpt-4o-mini`。支援圖片（base64 vision）與 PDF（使用 `pdfjs-dist` 在 client 端提取文字）作為問答上下文。支援匯出 markdown 表格為 CSV。 |

**主題切換** — 每個頁面各自管理 `isDark` 布林值，由固定位置的按鈕切換。深色／亮色類別（`.home-root.light`、`.link-root.light`、`.chat-root.light`）會覆寫各元件根元素上定義的 CSS 變數。字型：`Noto Sans TC`、`Cormorant Garamond`、`DM Mono`，透過 Google Fonts 載入（定義於 `index.html`）。

**新增頁面**

1. 建立 `Page.tsx` 與 `Page.css`
2. 在 `App.tsx` 的 `export type Page` 中加入新頁面的 key
3. 在 `App.tsx` 中新增對應的條件式 render 分支
4. 在 `Home.tsx` 的 `NAV_ITEMS` 中新增一張卡片，並將 `page` 屬性設為新 key

**新增首頁導覽卡片**

`NAV_ITEMS` 中的每個項目需包含 `index`（顯示用數字字串）、`name`、`description`，以及以下三者之一：`page`（內部導航）、`href`（外部連結）、`disabled: true`（停用）。

## 部署

**建置 Docker image**
```bash
docker build -t file-center:latest .
```

**設定 port**（編輯 `.env`）
```
UI_PORT=3000
```

**啟動容器**
```bash
docker-compose up -d
```

**停止容器**
```bash
docker-compose down
```
