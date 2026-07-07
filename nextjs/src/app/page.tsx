export default function Home() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '40px', maxWidth: '600px' }}>
      <h1>U2B-Vertex ERP</h1>
      <p style={{ color: 'green', fontWeight: 'bold' }}>Server running - Next.js 14 + Neon</p>
      <hr style={{ margin: '20px 0' }} />
      <h3>API Endpoints:</h3>
      <ul style={{ lineHeight: '2' }}>
        <li><a href="/api/certs">/api/certs</a></li>
        <li><a href="/api/products">/api/products</a></li>
        <li><a href="/api/finance">/api/finance</a></li>
        <li><a href="/api/sales">/api/sales</a></li>
      </ul>
    </main>
  );
}
