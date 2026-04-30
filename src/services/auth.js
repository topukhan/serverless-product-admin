import { supabase } from './supabase.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
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
