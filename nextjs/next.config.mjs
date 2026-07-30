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
  // HTML кабинетов не кэшировать жёстко — иначе после деплоя мастер/директор
  // видят старую версию (CDN/браузер). Всегда ревалидируем.
  async headers() {
    const noCache = [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }];
    return [
      { source: '/mobile_master.html', headers: noCache },
      { source: '/mobile_director.html', headers: noCache },
      { source: '/master', headers: noCache },
      { source: '/director', headers: noCache },
      { source: '/sw.js', headers: noCache },
    ];
  },
};

export default nextConfig;
