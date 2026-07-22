-- PostgREST needs a schema-cache reload before clients can call the new
-- p_max_leg_rank RPC parameter added by the previous migration.
notify pgrst, 'reload schema';
