// Pure post-login landing resolver (no imports) — where each role goes right
// after signing in. Kept dependency-free so the role→screen routing is unit
// tested without booting Next/auth.
//
//   master   → всегда свой кабинет /master
//   director → с телефона /director, с компьютера — полный ERP
//   остальные (admin, accountant, manager, …) → ERP как раньше
export type Landing = '/master' | '/director' | '/sketch_screens.html';

export function landingPath(role: string | null | undefined, isMobile: boolean): Landing {
  switch (role) {
    case 'master':
      return '/master';
    case 'director':
      return isMobile ? '/director' : '/sketch_screens.html';
    default:
      return '/sketch_screens.html';
  }
}
