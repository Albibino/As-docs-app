import axios, { AxiosInstance } from "axios";
import APP_ROUTE from "@/lib/app-route.ts";

const api: AxiosInstance = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => {
    // we need the response headers for these endpoints
    const exemptEndpoints = [
      "/api/pages/export",
      "/api/spaces/export",
      "/api/docx-export",
      "/api/bases/export-csv",
    ];
    if (response.request.responseURL) {
      const path = new URL(response.request.responseURL)?.pathname;
      if (path && exemptEndpoints.includes(path)) {
        return response;
      }
    }

    return response.data;
  },
  async (error) => {
    if (error.response) {
      switch (error.response.status) {
        case 401: {
          const url = new URL(error.request.responseURL)?.pathname;
          if (url === "/api/auth/collab-token") return;
          redirectToLogin();
          break;
        }
        case 403:
          // Handle forbidden error
          break;
        case 404:
          // Handle not found error
          if (
            error.response.data.message
              .toLowerCase()
              .includes("workspace not found")
          ) {
            console.log("workspace not found");
            // TCC: o workspace é criado pelo seed do servidor; não há
            // tela de setup para onde mandar o usuário.
          }
          break;
        case 500:
          // Handle internal server error
          break;
        default:
          break;
      }
    }
    return Promise.reject(error);
  },
);

function redirectToLogin() {
  const exemptPaths = [APP_ROUTE.AUTH.LOGIN];
  if (!exemptPaths.some((path) => window.location.pathname.startsWith(path))) {
    const redirectTo = window.location.pathname;
    if (redirectTo === APP_ROUTE.HOME) {
      window.location.href = APP_ROUTE.AUTH.LOGIN;
    } else {
      const params = new URLSearchParams({ redirect: redirectTo });
      window.location.href = `${APP_ROUTE.AUTH.LOGIN}?${params.toString()}`;
    }
  }
}

export default api;
