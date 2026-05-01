import { supabase } from './supabase.js';

// Single in-flight promise so concurrent callers (header, route guard,
// chat panel, etc.) share one auth.getSession() round trip. Without this,
// supabase-js's Web Locks coordinator can warn about orphaned locks when
// many calls pile up at once.
let cachedSession = null;
let pendingSession = null;
let cacheReady = false;

supabase.auth.onAuthStateChange((_event, session) => {
  cachedSession = session;
  cacheReady = true;
});

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  cachedSession = data.session ?? null;
  cacheReady = true;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  cachedSession = null;
  cacheReady = true;
}

export async function getSession() {
  if (cacheReady) return cachedSession;
  if (!pendingSession) {
    pendingSession = supabase.auth.getSession()
      .then(({ data: { session } }) => {
        cachedSession = session;
        cacheReady = true;
        return session;
      })
      .finally(() => { pendingSession = null; });
  }
  return pendingSession;
}

export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

// Calls the Postgres `is_admin()` function defined in schema.sql. Returns
// true only if the current user's UID exists in the `admins` table.
export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) return false;
  return data === true;
}

export function onAuthChange(handler) {
  const { data: { subscription } } =
    supabase.auth.onAuthStateChange((_event, session) => handler(session));
  return () => subscription.unsubscribe();
}
