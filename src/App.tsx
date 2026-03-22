import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Home from "./Home";
import Link, { type TreeItem } from "./Link";
import Chat from "./Chat";
import Tts from "./Tts";
import Celebrity from "./Celebrity";
import Learner from "./Learner";
import Ebook from "./Ebook";
import PaperDoc from "./PaperDoc";
import UserManage from "./UserManage";
import AdminManage from "./AdminManage";
import SnakeGame from "./SnakeGame";
import Game from "./Game";
import Tetris from "./Tetris";
import Breakout from "./Breakout";
import FlappyBird from "./FlappyBird";
import Invaders from "./Invaders";
import { AuthProvider } from "./AuthContext";

function AppRoutes() {
  const navigate = useNavigate();
  const [root, setRoot] = useState<TreeItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [linkConflict, setLinkConflict] = useState(false);
  const linksEtag = useRef("");

  useEffect(() => {
    fetch("/api/links")
      .then((r) => {
        linksEtag.current = (r.headers.get("etag") ?? "").replace(/"/g, "");
        return r.json();
      })
      .then((data: TreeItem[]) => setRoot(data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const handleRootChange = (newRoot: TreeItem[]) => {
    setRoot(newRoot);
    fetch("/api/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(linksEtag.current ? { "If-Match": `"${linksEtag.current}"` } : {}),
      },
      body: JSON.stringify(newRoot),
    })
      .then(async (r) => {
        if (r.status === 409) {
          const fresh = await fetch("/api/links");
          linksEtag.current = (fresh.headers.get("etag") ?? "").replace(
            /"/g,
            "",
          );
          const freshData: TreeItem[] = await fresh.json();
          setRoot(freshData);
          setLinkConflict(true);
          setTimeout(() => setLinkConflict(false), 5000);
          return;
        }
        linksEtag.current = (r.headers.get("etag") ?? "").replace(/"/g, "");
      })
      .catch(() => {});
  };

  if (!loaded) return null;

  const goHome = () => navigate("/");
  const goGame = () => navigate("/game");

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/link"
          element={
            <Link root={root} onRootChange={handleRootChange} onBack={goHome} />
          }
        />
        <Route path="/chat" element={<Chat onBack={goHome} />} />
        <Route path="/tts" element={<Tts onBack={goHome} />} />
        <Route path="/celebrity" element={<Celebrity onBack={goHome} />} />
        <Route path="/learner" element={<Learner onBack={goHome} />} />
        <Route path="/ebook" element={<Ebook onBack={goHome} />} />
        <Route path="/paper" element={<PaperDoc onBack={goHome} />} />
        <Route path="/user-manage" element={<UserManage onBack={goHome} />} />
        <Route path="/admin-manage" element={<AdminManage onBack={goHome} />} />
        <Route path="/game"     element={<Game      onBack={goHome} />} />
        <Route path="/snake"    element={<SnakeGame onBack={goGame} />} />
        <Route path="/tetris"   element={<Tetris    onBack={goGame} />} />
        <Route path="/breakout" element={<Breakout  onBack={goGame} />} />
        <Route path="/flappy"   element={<FlappyBird onBack={goGame} />} />
        <Route path="/invaders" element={<Invaders  onBack={goGame} />} />
      </Routes>
      {linkConflict && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a2a4a",
            border: "1px solid rgba(224,92,92,0.5)",
            color: "#e8e4dc",
            padding: "10px 20px",
            borderRadius: "10px",
            fontSize: "13px",
            letterSpacing: "0.04em",
            zIndex: 9999,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            fontFamily: "'Noto Sans TC', sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          ⚠ 資料已被他人更新，已自動重新整理，請重新操作。
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
