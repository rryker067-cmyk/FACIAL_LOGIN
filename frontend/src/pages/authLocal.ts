type UsuarioLocal = {
  email: string;
  password: string;
  name: string;
  role: string;
};

const leerUsuariosLocales = (): UsuarioLocal[] => {
  try {
    const raw = localStorage.getItem("app_local_users");
    const parsed = raw ? (JSON.parse(raw) as UsuarioLocal[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Usuario por defecto inicial
const USUARIO_DEFECTO: UsuarioLocal = {
  email: "admin@empresa.com",
  password: "123",
  name: "Administrador",
  role: "Administrador",
};

// Función para obtener todos los usuarios (los guardados + el por defecto)
export const obtenerUsuariosLocales = (): UsuarioLocal[] => {
  const guardados = leerUsuariosLocales();
  return [USUARIO_DEFECTO, ...guardados];
};

// Función para registrar un nuevo usuario localmente
export const registrarUsuarioLocal = (
  name: string,
  email: string,
  password: string
): { success: boolean; message: string } => {
  const guardados = leerUsuariosLocales();

  // Verificar si ya existe
  const existe = guardados.find((usuario: UsuarioLocal) => usuario.email.toLowerCase() === email.toLowerCase());
  if (existe) {
    return { success: false, message: "Este correo ya está registrado." };
  }

  const nuevoUsuario: UsuarioLocal = {
    name,
    email: email.toLowerCase(),
    password,
    role: "Usuario Local",
  };

  guardados.push(nuevoUsuario);
  localStorage.setItem("app_local_users", JSON.stringify(guardados));

  return { success: true, message: "¡Registro exitoso!" };
};

// Función para validar el inicio de sesión
export const validarLoginLocal = (
  email: string,
  password: string
): { success: boolean; user?: UsuarioLocal; message?: string } => {
  const usuarios = obtenerUsuariosLocales();
  const encontrado = usuarios.find(
    (usuario: UsuarioLocal) =>
      usuario.email.toLowerCase() === email.trim().toLowerCase() && usuario.password === password.trim()
  );

  if (encontrado) {
    return { success: true, user: encontrado };
  }

  return {
    success: false,
    message: "Credenciales inválidas. Verifique su usuario y contraseña.",
  };
};