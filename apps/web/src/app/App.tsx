import { API_PREFIX } from '@srm/shared';

// Placeholder shell. Router, providers and role-based layouts arrive in US-1.3 (shadcn init).
export function App() {
  return (
    <main>
      <h1>Smart Recruit Match</h1>
      <p>
        Hệ thống đang khởi tạo. Kiểm tra API tại <a href={`/${API_PREFIX}/health`}>/{API_PREFIX}/health</a>.
      </p>
    </main>
  );
}
