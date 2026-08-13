import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { LenisProvider, scrollToTop } from "./lib/lenis";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { HomePage } from "./pages/HomePage";
import { ArtisanPage } from "./pages/ArtisanPage";
import { TraditionPage } from "./pages/TraditionPage";
import { VerificationPage } from "./pages/VerificationPage";
import { PassportPage } from "./pages/PassportPage";

function RouteScroller() {
  const location = useLocation();
  useEffect(() => {
    scrollToTop();
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <LenisProvider>
        <RouteScroller />
        <div className="min-h-screen bg-museum-black text-museum-parchment">
          <Navbar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/artisans/:id" element={<ArtisanPage />} />
            <Route path="/traditions/:id" element={<TraditionPage />} />
            <Route path="/verify" element={<VerificationPage />} />
            <Route path="/passport" element={<PassportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Footer />
        </div>
      </LenisProvider>
    </BrowserRouter>
  );
}
