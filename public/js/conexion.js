/* Conexión de la intranet compartida (IMOBU y MD Invest) a Supabase.
   Proyecto "imobu-mdiaz" de la organización IMOBU. Ambos valores son PÚBLICOS
   por diseño: la seguridad la ponen el inicio de sesión y las reglas de la base
   de datos (ver supabase/web.sql). Nunca pongas aquí la clave "service_role"
   ni contraseñas. Vacíos = intranet desconectada. */
var IMOBU_CONEXION = {
  "supabaseUrl": "https://hpcmsufawcqigzxxrigt.supabase.co",
  "supabaseAnonKey": "sb_publishable_Nf6xTHrLXzL7pjN2TZQcYQ_SxaHDCNj"
};
