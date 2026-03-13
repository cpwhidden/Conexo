import { GoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { user, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const from = (location.state as any)?.from || searchParams.get("redirect") || "/";

  if (user) return <Navigate to={from} replace />;

  return (
    <div className="login-page">
      <h1>Conexo</h1>
      <p>Organize your dance moves and discover connections between them.</p>
      {error && <p style={{ color: "#e94560" }}>{error}</p>}
      <div className="login-button-wrapper">
        <GoogleLogin
          onSuccess={async (response) => {
            if (response.credential) {
              try {
                setError(null);
                await login(response.credential);
              } catch (err: any) {
                const detail =
                  err.response?.data?.detail || err.message || "Login failed";
                setError(detail);
                console.error("Login error:", err.response?.data || err);
              }
            }
          }}
          onError={() => {
            setError("Google sign-in failed. Please try again.");
          }}
        />
      </div>
    </div>
  );
}
