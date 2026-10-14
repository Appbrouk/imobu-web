/* IMOBU — conexión de la intranet (Supabase).
   Ambos valores son PÚBLICOS por diseño: la seguridad la ponen el inicio de sesión
   y las reglas de la base de datos (ver supabase/intranet.sql). Nunca pongas aquí
   la clave "service_role" ni contraseñas.
   Vacíos = intranet en modo local (genera config.js para subir a mano). */
var IMOBU_CONEXION = {
  "supabaseUrl": "https://eeovnnviwnuiooodxrob.supabase.co",
  "supabaseAnonKey": "sb_publishable_FwBTumhv5pT02Bc_f-g4WA_FT7rS6lw"
};
