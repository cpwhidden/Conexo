import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import CollectionDetailPage from "./pages/CollectionDetailPage";
import CollectionGraphPage from "./pages/CollectionGraphPage";
import DrawConnectionsPage from "./pages/DrawConnectionsPage";
import LearnPage from "./pages/LearnPage";
import CollectionsPage from "./pages/CollectionsPage";
import LoginPage from "./pages/LoginPage";
import MoveDetailPage from "./pages/MoveDetailPage";
import MoveFormPage from "./pages/MoveFormPage";
import MovesPage from "./pages/MovesPage";
import SequenceDetailPage from "./pages/SequenceDetailPage";
import SequencesPage from "./pages/SequencesPage";
import ThemeDetailPage from "./pages/ThemeDetailPage";
import ThemesPage from "./pages/ThemesPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<MovesPage />} />
          <Route path="/moves/new" element={<MoveFormPage />} />
          <Route path="/moves/:moveId" element={<MoveDetailPage />} />
          <Route path="/moves/:moveId/edit" element={<MoveFormPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collections/:id" element={<Navigate to="graph" replace />} />
          <Route path="/collections/:id/moves" element={<CollectionDetailPage />} />
          <Route path="/collections/:id/graph" element={<CollectionGraphPage />} />
          <Route path="/collections/:id/learn" element={<LearnPage />} />
          <Route path="/collections/:id/learn/draw-connections" element={<DrawConnectionsPage />} />
          <Route path="/sequences" element={<SequencesPage />} />
          <Route path="/sequences/:sequenceId" element={<SequenceDetailPage />} />
          <Route path="/themes" element={<ThemesPage />} />
          <Route path="/themes/:id" element={<ThemeDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
