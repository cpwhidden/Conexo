import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8888";

const client = axios.create({
  baseURL: `${API_BASE_URL}/api`,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthEndpoint = error.config?.url?.startsWith("/auth/");
    if (error.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem("access_token");
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
    }
    return Promise.reject(error);
  }
);

export default client;
