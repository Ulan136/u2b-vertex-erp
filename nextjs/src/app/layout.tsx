import './globals.css';

export const metadata = {
  title: 'U2B-Vertex ERP',
  description: 'Vertex Metrology',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
