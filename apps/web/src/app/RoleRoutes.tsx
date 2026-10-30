import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { CircleHelp, LockKeyhole } from "lucide-react";
import type { SessionView } from "@e4s/contracts";

const LearnerRouteController = lazy(() => import("./learner/LearnerRouteController.js").then(({ LearnerRouteController }) => ({ default: LearnerRouteController })));
const ManagerRouteController = lazy(() => import("./manager/ManagerRouteController.js").then(({ ManagerRouteController }) => ({ default: ManagerRouteController })));
const OperatorRouteController = lazy(() => import("./operator/OperatorRouteController.js").then(({ OperatorRouteController }) => ({ default: OperatorRouteController })));

const managerRoutes = ["/mgr", "/mgr/ops", "/mgr/month", "/mgr/recovery", "/mgr/reminders", "/mgr/report", "/mgr/rewards"] as const;
const operatorRoutes = ["/op", "/op/levelforms", "/op/months", "/op/weeks", "/op/lessons", "/op/review", "/op/tests"] as const;

export function RoleRoutes({ session }: { session: SessionView }) {
  const location = useLocation();
  const pathname = normalizePathname(location.pathname);
  const role: unknown = session.role;
  const operatorRoute = isRouteOrChild(pathname, "/op");
  const managerArea = isRouteOrChild(pathname, "/mgr");
  const settingsArea = isRouteOrChild(pathname, "/settings");
  const rewardPreviewRoute = isRouteOrChild(pathname, "/reward/preview");
  const managerRoute = managerRoutes.some((route) => route === pathname) || (role === "manager" && isKnownManagerOperationsRoute(pathname));
  if (!isSupportedRole(role)) return <AccessFallback home="/" message="Vai trò tài khoản này không được hỗ trợ. Vui lòng quay lại trang bắt đầu." />;
  if (role === "learner") {
    if (operatorRoute) return <AccessFallback home="/home" message="Tài khoản này không có quyền mở khu vực vận hành." />;
    if (managerArea || settingsArea || (rewardPreviewRoute && pathname !== "/reward/preview")) return <AccessFallback home="/home" message="Tài khoản này không có quyền mở khu vực quản lý." />;
    if (pathname === "/") return <Navigate replace to="/home" />;
    return <RoleRouteLoadingBoundary label={loadingLabel(pathname)}><LearnerRouteController /></RoleRouteLoadingBoundary>;
  }
  if (pathname === "/op/prompts") return <AccessFallback home="/op" message="Tài khoản này không có quyền mở cấu hình Prompt & rubric." />;
  if (pathname === "/mgr/ops/prompts") return role === "manager" ? <Navigate replace to="/settings/prompts" /> : <AccessFallback home="/op" message="Tài khoản này không có quyền mở cấu hình Prompt & rubric." />;
  if (pathname === "/settings/prompts") {
    return role === "manager"
      ? <RoleRouteLoadingBoundary label="Đang tải Prompt & rubric"><OperatorRouteController session={session} basePath="/mgr/ops" /></RoleRouteLoadingBoundary>
      : <AccessFallback home="/op" message="Tài khoản này không có quyền mở cấu hình Prompt & rubric." />;
  }
  if (pathname === "/" || pathname === "/home") return <Navigate replace to={role === "operator" ? "/op" : "/mgr"} />;
  if (role === "operator" && (managerArea || rewardPreviewRoute || (settingsArea && pathname !== "/settings"))) return <AccessFallback home="/op" message="Tài khoản này không có quyền mở khu vực quản lý." />;
  if (role === "manager" && operatorRoute) return <Navigate replace to="/mgr/ops" />;
  if (pathname === "/settings" || managerRoute || (role === "manager" && pathname === "/reward/preview")) {
    return <RoleRouteLoadingBoundary label={loadingLabel(pathname)}><ManagerRouteController role={role} currentUserId={session.user.id} /></RoleRouteLoadingBoundary>;
  }
  if (operatorRoute) {
    if (!isKnownOperatorRoute(pathname)) return <OperatorRouteNotFound />;
    return <RoleRouteLoadingBoundary label={loadingLabel(pathname)}><OperatorRouteController session={session} /></RoleRouteLoadingBoundary>;
  }
  return <section className="empty"><div className="big" aria-hidden="true"><CircleHelp size={32} strokeWidth={1.8} /></div><p>Không tìm thấy trang.</p><Link className="btn" to={role === "operator" ? "/op" : "/mgr"}>Về trang chủ</Link></section>;
}

function RoleRouteLoadingBoundary({ children, label }: { children: ReactNode; label: string }) {
  return <RoleRouteErrorBoundary><Suspense fallback={<section className="empty" aria-busy="true"><p role="status">{label}…</p></section>}>{children}</Suspense></RoleRouteErrorBoundary>;
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
  return <section className="card danger" role="alert"><div className="row"><p>Đường dẫn vận hành không tồn tại.</p></div></section>;
}

function isKnownOperatorRoute(pathname: string): boolean {
  return operatorRoutes.some((route) => route === pathname) || /^\/op\/lessons\/\d+\/(A1|A2|B1|B2|C1)$/.test(pathname);
}

function isKnownManagerOperationsRoute(pathname: string): boolean {
  return ["/mgr/ops/levels", "/mgr/ops/months", "/mgr/ops/weeks", "/mgr/ops/lessons", "/mgr/ops/review", "/mgr/ops/tests", "/mgr/ops/prompts", "/mgr/ops/level-forms"].includes(pathname)
    || /^\/mgr\/ops\/lessons\/\d+\/(A1|A2|B1|B2|C1)$/.test(pathname);
}

function loadingLabel(pathname: string): string {
  if (pathname === "/settings") return "Đang tải cài đặt";
  if (pathname === "/mgr") return "Đang tải tiến độ nhóm";
  if (pathname === "/mgr/ops") return "Đang tải hiệu suất vận hành";
  if (pathname === "/mgr/reminders") return "Đang tải danh sách nhắc học";
  if (pathname === "/mgr/recovery") return "Đang tải danh sách khôi phục";
  if (pathname === "/mgr/report") return "Đang tải báo cáo";
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
  return <section className="empty"><div className="big" aria-hidden="true"><LockKeyhole size={32} strokeWidth={1.8} /></div><p role="alert">{message}</p>{home ? <Link className="btn" to={home}>Về trang chủ</Link> : null}</section>;
}
