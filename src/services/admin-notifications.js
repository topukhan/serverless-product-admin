import { supabase } from './supabase.js';

export async function getNotificationConfig() {
  const { data, error } = await supabase
    .from('notification_config').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

export async function saveNotificationConfig(patch) {
  const { data, error } = await supabase
    .from('notification_config')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function sendTestNotification() {
  const { error } = await supabase.rpc('send_test_notification');
  if (error) throw error;
}
