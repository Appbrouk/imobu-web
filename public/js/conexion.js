/* Conexión de la intranet compartida (IMOBU y MD Invest) a Supabase.
   Ambos valores son PÚBLICOS por diseño: la seguridad la ponen el inicio de sesión
   y las reglas de la base de datos (ver supabase/web.sql). Nunca pongas aquí
   la clave "service_role" ni contraseñas.
   Vacíos = intranet desconectada (muestra un aviso y no deja entrar). */
var IMOBU_CONEXION = {
  "supabaseUrl": "",
  "supabaseAnonKey": ""
};
