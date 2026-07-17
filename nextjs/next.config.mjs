/** @type {import('next').NextConfig} */
const nextConfig = {
  // Чистые URL мобильных кабинетов → статические файлы в /public.
  // Доступ по роли навешивается в middleware (rewrites выполняются после него).
  async rewrites() {
    return [
      { source: '/master', destination: '/mobile_master.html' },
      { source: '/director', destination: '/mobile_director.html' },
    ];
  },
};

export default nextConfig;
