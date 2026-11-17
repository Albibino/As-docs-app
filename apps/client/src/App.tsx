import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "@/pages/auth/login";
import Home from "@/pages/dashboard/home";
import Page from "@/pages/page/page";
import AccountSettings from "@/pages/settings/account/account-settings";
import WorkspaceMembers from "@/pages/settings/workspace/workspace-members";
import WorkspaceSettings from "@/pages/settings/workspace/workspace-settings";
import WorkspaceMetadata from "@/pages/settings/workspace/workspace-metadata";
import { Error404 } from "@/components/ui/error-404.tsx";
import AccountPreferences from "@/pages/settings/account/account-preferences.tsx";
import SpaceHome from "@/pages/space/space-home.tsx";
import PageRedirect from "@/pages/page/page-redirect.tsx";
import Layout from "@/components/layouts/global/layout.tsx";
import { useTranslation } from "react-i18next";
import { useTrackOrigin } from "@/hooks/use-track-origin";
import SpacesPage from "@/pages/spaces/spaces.tsx";
import SpaceTrash from "@/pages/space/space-trash.tsx";
import FavoritesPage from "@/pages/favorites/favorites-page";
import LegacyChatRedirect from "@/features/assistant/pages/legacy-chat-redirect.tsx";
import LabelPage from "@/pages/label/label-page";
import LabelsSettings from "@/pages/settings/labels/labels-settings";
import SpaceSettings from "@/pages/settings/space/space-settings.tsx";
import Teams from "@/pages/settings/team/teams.tsx";
import { WorkspaceAdminRoute } from "@/features/workspace/components/workspace-admin-route.tsx";
import { TeamManagementRoute } from "@/features/team/components/team-management-route.tsx";

export default function App() {
  const { t } = useTranslation();
  useTrackOrigin();

  return (
    <>
      <Routes>
        <Route index element={<Navigate to="/home?entry=1" replace />} />
        <Route path={"/login/*"} element={<LoginPage />} />

        <Route path={"/p/:pageSlug"} element={<PageRedirect />} />

        <Route element={<Layout />}>
          <Route path={"/home"} element={<Home />} />
          <Route path={"/home/chat/:chatId"} element={<Home />} />
          <Route path={"/ai"} element={<Navigate to="/home" replace />} />
          <Route path={"/ai/chat/:chatId"} element={<LegacyChatRedirect />} />
          <Route path={"/spaces"} element={<SpacesPage />} />
          <Route path={"/favorites"} element={<FavoritesPage />} />
          <Route path={"/labels/:labelId"} element={<LabelPage />} />
          <Route
            path={"/s/:spaceSlug/settings/:tab"}
            element={<SpaceSettings />}
          />
          <Route
            path={"/s/:spaceSlug/settings"}
            element={<Navigate to="general" replace />}
          />
          <Route path={"/s/:spaceSlug"} element={<SpaceHome />} />
          <Route path={"/s/:spaceSlug/trash"} element={<SpaceTrash />} />
          <Route path={"/s/:spaceSlug/p/:pageSlug"} element={<Page />} />

          <Route path={"/settings"}>
            <Route path={"account/profile"} element={<AccountSettings />} />
            <Route
              path={"account/preferences"}
              element={<AccountPreferences />}
            />
            <Route
              path={"workspace"}
              element={
                <WorkspaceAdminRoute>
                  <WorkspaceSettings />
                </WorkspaceAdminRoute>
              }
            />
            <Route
              path={"metadata"}
              element={
                <WorkspaceAdminRoute>
                  <WorkspaceMetadata />
                </WorkspaceAdminRoute>
              }
            />
            <Route
              path={"members"}
              element={
                <WorkspaceAdminRoute>
                  <WorkspaceMembers />
                </WorkspaceAdminRoute>
              }
            />
            <Route
              path={"spaces"}
              element={<Navigate to="/settings/teams" replace />}
            />
            <Route
              path={"teams"}
              element={<TeamManagementRoute><Teams /></TeamManagementRoute>}
            />
            <Route
              path={"labels"}
              element={<WorkspaceAdminRoute><LabelsSettings /></WorkspaceAdminRoute>}
            />
          </Route>
        </Route>

        <Route path="*" element={<Error404 />} />
      </Routes>
    </>
  );
}
