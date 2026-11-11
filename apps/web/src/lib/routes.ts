/**
 * The routes for the application
 */
export enum Routes {
  Root = '/',

  // marketing pages
  FAQ = '/#faq',
  Features = '/#features',
  Pricing = '/pricing', // change to /#pricing if you want to use the pricing section in homepage
  Models = '/models',
  Rankings = '/rankings',
  Blog = '/blog',
  Docs = '/docs',
  About = '/about',
  Contact = '/contact',
  Waitlist = '/waitlist',
  Changelog = '/changelog',
  Roadmap = '/blog/roadmap',
  CookiePolicy = '/cookie',
  PrivacyPolicy = '/privacy',
  TermsOfService = '/terms',

  // auth routes
  Login = '/signin',
  Register = '/register',
  AuthError = '/auth/error',
  ForgotPassword = '/auth/forgot-password',
  AcceptInvite = '/auth/accept-invite',
  ResetPassword = '/auth/reset-password',
  Welcome = '/auth/welcome',
  UsageList = '/dashboard/usage-list',
  // dashboard routes
  Dashboard = '/dashboard',
  Settings = '/settings',
  SettingsProfile = '/settings/profile',
  SettingsBilling = '/settings/billing',
  SettingsSecurity = '/settings/security',
  SettingsNotifications = '/settings/notifications',
  SettingsPlatforms = '/settings/platforms',
  SettingsInvite = '/settings/invite',
  SettingsLogout = '/settings/logout',

  // platform console (formerly /crossborder)
  Console = '/console',
  ConsoleTenants = '/console/tenants',
  ConsoleOnboarding = '/console/onboarding',
  ConsoleShops = '/console/shops',
  ConsoleUsers = '/console/users',
  ConsoleInvitations = '/console/invitations',
  ConsoleShopConflicts = '/console/shop-conflicts',
  ConsoleAuthExceptions = '/console/auth-exceptions',
  ConsoleSyncHealth = '/console/sync-health',
  ConsolePendingActions = '/console/pending-actions',
  SettingsPlatformConfig = '/settings/platform-config',
  SettingsAuditLogs = '/settings/audit-logs',
  SettingsAnnouncements = '/settings/announcements',
  SettingsRoles = '/settings/roles',

  // backward-compatible aliases
  Crossborder = Console,
  CrossborderTenants = ConsoleTenants,
  CrossborderOnboarding = ConsoleOnboarding,
  CrossborderShops = ConsoleShops,
  CrossborderUsers = ConsoleUsers,
  CrossborderShopConflicts = ConsoleShopConflicts,
  CrossborderAuthExceptions = ConsoleAuthExceptions,
  CrossborderSyncHealth = ConsoleSyncHealth,
  CrossborderPendingActions = ConsolePendingActions,
  CrossborderPlatformConfig = SettingsPlatformConfig,
  CrossborderAuditLogs = SettingsAuditLogs,
  CrossborderAnnouncements = SettingsAnnouncements,
  CrossborderRoles = SettingsRoles,
}

/**
 * The routes that can not be accessed by logged in users
 */
export const routesNotAllowedByLoggedInUsers = [Routes.Login, Routes.Register]
