import { redirect } from 'next/navigation';

// The ERP UI is the static app shell served same-origin (behind auth via
// middleware). Root just forwards to it.
export default function Home() {
  redirect('/sketch_screens.html');
}
