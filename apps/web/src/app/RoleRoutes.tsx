import { NotFoundState, StatusHomeIcon } from "./shared/StatusPage.js";
import { Component, createContext, Suspense, useContext, useEffect, useState, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import type { SessionView } from "@e4s/contracts";
import { ManagerSectionLayout } from "./manager/shared.js";
import type { LearnerRouteProps } from "./learner/LearnerRouteController.js";

const RouteLoadingLabelContext = createContext("Đang tải trang");

function RouteLoadingFallback() {
  const label = useContext(RouteLoadingLabelContext);
  return <section className="empty" aria-busy="true"><p role="status">{label}…</p></section>;
}

/**
 * A code-split role controller that can be fetched before it is rendered.
 * Unlike React.lazy, an already loaded module renders synchronously, and a
 * pending one shows the route fallback without a Suspense boundary, so the
 * page is not held behind React's 300 ms fallback reveal throttle.
 * Load failures are rethrown during render for RoleRouteErrorBoundary.
 */
function preloadableRoute<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const preload = () => pending ??= load().then((component) => { loaded = component; return component; }, (error: unknown) => { pending = undefined; throw error; });
  function PreloadableRoute(props: P) {
    const [component, setComponent] = useState<ComponentType<P> | undefined>(() => loaded);
    const [failure, setFailure] = useState<{ error: unknown }>();
    useEffect(() => {
      if (component) return;
      let live = true;
      preload().then((next) => { if (live) setComponent(() => next); }, (error: unknown) => { if (live) setFailure({ error }); });
      return () => { live = false; };
    }, [component]);
    if (failure) throw failure.error;
    if (!component) return <RouteLoadingFallback />;
    const Loaded = component;
    return <Loaded {...props} />;
  }
  return { Component: PreloadableRoute, preload };
}

const learnerRouteModule = preloadableRoute<LearnerRouteProps>(() => import("./learner/LearnerRouteController.js").then(({ LearnerRouteController }) => LearnerRouteController));
const managerRouteModule = preloadableRoute(() => import("./manager/ManagerRouteController.js").then(({ ManagerRouteController }) => ManagerRouteController));
const operatorRouteModule = preloadableRoute(() => import("./operator/OperatorRouteController.js").then(({ OperatorRouteController }) => OperatorRouteController));
const LearnerRouteController = learnerRouteModule.Component;
const ManagerRouteController = managerRouteModule.Component;
const OperatorRouteController = operatorRouteModule.Component;

/**
 * Starts downloading the role controller a route will need, so it can load in
 * parallel with the session/theme bootstrap instead of after it. Best effort:
 * failures are surfaced again (and recovered) when the route renders.
 */
export function preloadRoleRoute(role: SessionView["role"] | null, pathname: string) {
  const path = normalizePathname(pathname);
  const staffSettings = path === "/settings";
  const target = role === "learner" ? learnerRouteModule
    : role === "operator" ? (staffSettings ? managerRouteModule : operatorRouteModule)
      : role === "manager" ? (path.startsWith("/mgr/ops/") ? operatorRouteModule : managerRouteModule)
        : isRouteOrChild(path, "/op") ? operatorRouteModule
          : isRouteOrChild(path, "/mgr") || staffSettings ? managerRouteModule
            : undefined;
  void target?.preload().catch(() => undefined);
}

const managerRoutes = ["/mgr", "/mgr/ops", "/mgr/requests", "/mgr/holidays", "/mgr/reminders", "/mgr/report", "/mgr/surveys", "/mgr/rewards"] as const;
const operatorRoutes = ["/op", "/op/levelforms", "/op/months", "/op/review", "/op/requests", "/op/tests"] as const;
const managerContentRoutes = ["/mgr/ops/levels", "/mgr/ops/months", "/mgr/ops/review", "/mgr/ops/tests", "/mgr/ops/level-forms"] as const;

export function RoleRoutes({ session, onSessionRevoked, ...learnerProps }: { session: SessionView; onSessionRevoked?: (() => void) | undefined } & Pick<LearnerRouteProps, "onLearnerCefr" | "onPlacementRetakeActive" | "sharedProfileRecord" | "onProfileRecord">) {
  const location = useLocation();
  const pathname = normalizePathname(location.pathname);
  const role: unknown = session.role;
  const operatorRoute = isRouteOrChild(pathname, "/op");
  const managerArea = isRouteOrChild(pathname, "/mgr");
  const settingsArea = isRouteOrChild(pathname, "/settings");
  const rewardPreviewRoute = isRouteOrChild(pathname, "/reward/preview");
  const managerRoute = managerRoutes.some((route) => route === pathname);
  if (!isSupportedRole(role)) return <AccessFallback home="/" message="Vai trò tài khoản này không được hỗ trợ. Vui lòng quay lại trang bắt đầu." />;
  if (role === "learner") {
    if (operatorRoute) return <AccessFallback home="/home" message="Tài khoản này không có quyền mở khu vực vận hành." />;
    if (managerArea || settingsArea || (rewardPreviewRoute && pathname !== "/reward/preview")) return <AccessFallback home="/home" message="Tài khoản này không có quyền mở khu vực quản lý." />;
    if (pathname === "/") return <Navigate replace to="/home" />;
    return <RoleRouteLoadingBoundary label={loadingLabel(pathname)}><LearnerRouteController key={session.user.id} learnerId={session.user.id} courseCompleted={session.courseCompleted === true} {...learnerProps} /></RoleRouteLoadingBoundary>;
  }
  if (pathname === "/" || pathname === "/home") return <Navigate replace to={role === "operator" ? "/op" : "/mgr"} />;
  if (role === "operator" && (managerArea || rewardPreviewRoute || (settingsArea && pathname !== "/settings"))) return <AccessFallback home="/op" message="Tài khoản này không có quyền mở khu vực quản lý." />;
  const managerContentRoute = role === "manager" && managerContentRoutes.some((route) => pathname === route || (route === "/mgr/ops/months" && /^\/mgr\/ops\/months\/lesson\/[^/]+\/\d+$/u.test(pathname)));
  if (role === "manager" && !managerContentRoute && (operatorRoute || pathname.startsWith("/mgr/ops/"))) return <Navigate replace to="/mgr/ops" />;
  if (managerContentRoute || pathname === "/settings" || managerRoute || (role === "manager" && pathname === "/reward/preview")) {
    return <ManagerSectionLayout><RoleRouteLoadingBoundary label={loadingLabel(pathname)}>
      {managerContentRoute ? <OperatorRouteController session={session} basePath="/mgr/ops" />
        : <ManagerRouteController role={role} currentUserId={session.user.id} onSessionRevoked={onSessionRevoked} />}
    </RoleRouteLoadingBoundary></ManagerSectionLayout>;
  }
  if (operatorRoute) {
    if (!isKnownOperatorRoute(pathname)) return <OperatorRouteNotFound />;
    return <RoleRouteLoadingBoundary label={loadingLabel(pathname)}><OperatorRouteController session={session} /></RoleRouteLoadingBoundary>;
  }
  return <NotFoundState home={<Link className="btn btn-primary" to={role === "operator" ? "/op" : "/mgr"}><StatusHomeIcon />Về trang chủ</Link>} />;
}

function RoleRouteLoadingBoundary({ children, label }: { children: ReactNode; label: string }) {
  return <RoleRouteErrorBoundary><RouteLoadingLabelContext.Provider value={label}><Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense></RouteLoadingLabelContext.Provider></RoleRouteErrorBoundary>;
}

const roleBundleReloadKey = "e4s:role-bundle-reload-at";
const roleBundleReloadWindowMs = 30_000;

type ReloadStorage = Pick<Storage, "getItem" | "setItem">;

function isStaleRoleBundleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \d+ failed/i.test(message);
}

export function recoverStaleRoleBundle(
  error: unknown,
  storage: ReloadStorage,
  reload: () => void,
  now = Date.now(),
) {
  if (!isStaleRoleBundleError(error)) return false;
  const storedReloadAt = storage.getItem(roleBundleReloadKey);
  const previousReloadAt = storedReloadAt === null ? null : Number(storedReloadAt);
  if (previousReloadAt !== null && Number.isFinite(previousReloadAt) && now - previousReloadAt < roleBundleReloadWindowMs) return false;
  storage.setItem(roleBundleReloadKey, String(now));
  reload();
  return true;
}

export class RoleRouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; recoveryFailed: boolean }> {
  state = { failed: false, recoveryFailed: false };

  static getDerivedStateFromError() { return { failed: true, recoveryFailed: false }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      if (recoverStaleRoleBundle(error, window.sessionStorage, () => window.location.reload())) return;
    } catch (recoveryError) {
      console.error("Role route recovery failed", recoveryError);
    }
    console.error("Role route failed to load", error, info.componentStack);
    this.setState({ recoveryFailed: true });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (!this.state.recoveryFailed) return <section className="empty" aria-busy="true"><p role="status">Đang khôi phục giao diện…</p></section>;
    return <section className="empty" role="alert"><p><b>Không tải được giao diện.</b> Vui lòng đóng và mở lại E4S.</p></section>;
  }
}

function OperatorRouteNotFound() {
  return <NotFoundState message="Đường dẫn vận hành này không tồn tại hoặc đã đổi. Hãy quay về trang chủ Vận hành." home={<Link className="btn btn-primary" to="/op"><StatusHomeIcon />Về trang chủ</Link>} />;
}

function isKnownOperatorRoute(pathname: string): boolean {
  return operatorRoutes.some((route) => isRouteOrChild(pathname, route));
}

function loadingLabel(pathname: string): string {
  if (pathname === "/settings") return "Đang tải cài đặt";
  if (pathname === "/mgr") return "Đang tải tiến độ nhóm";
  if (pathname === "/mgr/ops") return "Đang tải hiệu suất vận hành";
  if (pathname === "/mgr/reminders") return "Đang tải danh sách nhắc học";
  if (pathname === "/mgr/requests") return "Đang tải danh sách yêu cầu";
  if (pathname === "/mgr/holidays") return "Đang tải lịch nghỉ lễ";
  if (pathname === "/mgr/report") return "Đang tải báo cáo";
  if (pathname === "/mgr/surveys") return "Đang tải khảo sát tháng";
  if (pathname === "/support") return "Đang tải yêu cầu";
  if (pathname === "/op") return "Đang tải duyệt trình độ";
  return "Đang tải trang";
}

function isSupportedRole(role: unknown): role is SessionView["role"] {
  return role === "learner" || role === "operator" || role === "manager";
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

function isRouteOrChild(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function AccessFallback({ message, home }: { message: string; home?: "/" | "/home" | "/op" | "/mgr/ops" }) {
  return <NotFoundState icon="lock" code="403" title="Không có quyền truy cập" message={message} home={home ? <Link className="btn btn-primary" to={home}><StatusHomeIcon />Về trang chủ</Link> : null} />;
}
