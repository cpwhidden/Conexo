import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import CollectionDetailPage from "./pages/CollectionDetailPage";
import CollectionGraphPage from "./pages/CollectionGraphPage";
import CollectionTagsPage from "./pages/CollectionTagsPage";
import TagDetailPage from "./pages/TagDetailPage";
import DrawConnectionsPage from "./pages/DrawConnectionsPage";
import LearnPage from "./pages/LearnPage";
import CollectionsPage from "./pages/CollectionsPage";
import AdminAllowedEmailsPage from "./pages/AdminAllowedEmailsPage";
import LoginPage from "./pages/LoginPage";
import MoveDetailPage from "./pages/MoveDetailPage";
import MoveFormPage from "./pages/MoveFormPage";
import SequenceDetailPage from "./pages/SequenceDetailPage";
import SequencesPage from "./pages/SequencesPage";
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
          <Route path="/" element={<CollectionsPage />} />
          <Route path="/moves/new" element={<MoveFormPage />} />
          <Route path="/moves/:moveId" element={<MoveDetailPage />} />
          <Route path="/moves/:moveId/edit" element={<MoveFormPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collections/:id" element={<Navigate to="flow" replace />} />
          <Route path="/collections/:id/moves" element={<CollectionDetailPage />} />
          <Route path="/collections/:id/flow" element={<CollectionGraphPage />} />
          <Route path="/collections/:id/graph" element={<CollectionGraphPage />} />
          <Route path="/collections/:id/tags" element={<CollectionTagsPage />} />
          <Route path="/collections/:id/tags/:tagId" element={<TagDetailPage />} />
          <Route path="/collections/:id/learn" element={<LearnPage />} />
          <Route path="/collections/:id/learn/draw-connections" element={<DrawConnectionsPage />} />
          <Route path="/collections/:id/sequences" element={<SequencesPage />} />
          <Route path="/sequences/:sequenceId" element={<SequenceDetailPage />} />
          <Route path="/admin/allowed-emails" element={<AdminAllowedEmailsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
