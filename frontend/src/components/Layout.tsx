import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close menu when route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="app-title">
          Conexo
        </Link>
        {user && (
          <>
            {/* Desktop navigation */}
            <nav className="app-nav desktop-nav">
              <Link to="/collections">Collections</Link>
              <span className="user-info">
                {user.picture_url && (
                  <img
                    src={user.picture_url}
                    alt={user.name}
                    className="user-avatar"
                  />
                )}
                {user.name}
              </span>
              <button onClick={logout} className="btn-logout">
                Logout
              </button>
            </nav>

            {/* Mobile hamburger button */}
            <button
              className={`hamburger-btn ${menuOpen ? "open" : ""}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
            </button>

            {/* Mobile menu overlay */}
            <div
              className={`mobile-menu-overlay ${menuOpen ? "open" : ""}`}
              onClick={() => setMenuOpen(false)}
            />

            {/* Mobile slide-in menu */}
            <nav className={`mobile-nav ${menuOpen ? "open" : ""}`}>
              <div className="mobile-nav-header">
                <span className="user-info">
                  {user.picture_url && (
                    <img
                      src={user.picture_url}
                      alt={user.name}
                      className="user-avatar"
                    />
                  )}
                  {user.name}
                </span>
              </div>
              <div className="mobile-nav-links">
                <Link to="/collections" onClick={() => setMenuOpen(false)}>
                  Collections
                </Link>
              </div>
              <div className="mobile-nav-footer">
                <button onClick={logout} className="btn-logout">
                  Logout
                </button>
              </div>
            </nav>
          </>
        )}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
