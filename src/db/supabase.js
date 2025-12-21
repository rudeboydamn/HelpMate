import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
}

// Create Supabase client with service role key for server-side operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper functions to match SQLite-like API for easier migration

export const db = {
  // Single row query
  async get(table, query = {}) {
    const { data, error } = await supabase
      .from(table)
      .select(query.select || '*')
      .match(query.match || {})
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('DB get error:', error);
    }
    return data;
  },

  // Multiple rows query
  async all(table, query = {}) {
    let q = supabase.from(table).select(query.select || '*');
    
    if (query.match) q = q.match(query.match);
    if (query.eq) {
      for (const [key, value] of Object.entries(query.eq)) {
        q = q.eq(key, value);
      }
    }
    if (query.in) {
      for (const [key, values] of Object.entries(query.in)) {
        q = q.in(key, values);
      }
    }
    if (query.order) q = q.order(query.order.column, { ascending: query.order.ascending ?? true });
    if (query.limit) q = q.limit(query.limit);
    
    const { data, error } = await q;
    if (error) console.error('DB all error:', error);
    return data || [];
  },

  // Insert
  async insert(table, data) {
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select()
      .single();
    
    if (error) console.error('DB insert error:', error);
    return result;
  },

  // Insert many
  async insertMany(table, data) {
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select();
    
    if (error) console.error('DB insertMany error:', error);
    return result;
  },

  // Update
  async update(table, match, data) {
    const { data: result, error } = await supabase
      .from(table)
      .update(data)
      .match(match)
      .select()
      .single();
    
    if (error) console.error('DB update error:', error);
    return result;
  },

  // Delete
  async delete(table, match) {
    const { error } = await supabase
      .from(table)
      .delete()
      .match(match);
    
    if (error) console.error('DB delete error:', error);
    return !error;
  },

  // Count
  async count(table, match = {}) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .match(match);
    
    if (error) console.error('DB count error:', error);
    return count || 0;
  },

  // Raw query using RPC (for complex queries)
  async rpc(functionName, params = {}) {
    const { data, error } = await supabase.rpc(functionName, params);
    if (error) console.error('DB rpc error:', error);
    return data;
  }
};

export default supabase;
