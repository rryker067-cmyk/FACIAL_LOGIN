// authLocal.js

// Usuario por defecto inicial
const USUARIO_DEFECTO = {
  email: "admin@empresa.com",
  password: "123",
  name: "Administrador",
  role: "Administrador"
};

// Función para obtener todos los usuarios (los guardados + el por defecto)
export const obtenerUsuariosLocales = () => {
  const guardados = JSON.parse(localStorage.getItem('app_local_users') || '[]');
  return [USUARIO_DEFECTO, ...guardados];
};

// Función para registrar un nuevo usuario localmente
export const registrarUsuarioLocal = (name, email, password) => {
  const guardados = JSON.parse(localStorage.getItem('app_local_users') || '[]');
  
  // Verificar si ya existe
  const existe = guardados.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existe) {
    return { success: false, message: 'Este correo ya está registrado.' };
  }

  const nuevoUsuario = { name, email: email.toLowerCase(), password, role: 'Usuario Local' };
  guardados.push(nuevoUsuario);
  localStorage.setItem('app_local_users', JSON.stringify(guardados));
  
  return { success: true, message: '¡Registro exitoso!' };
};

// Función para validar el inicio de sesión
export const validarLoginLocal = (email, password) => {
  const usuarios = obtenerUsuariosLocales();
  const encontrado = usuarios.find(
    u => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password.trim()
  );

  if (encontrado) {
    return { success: true, user: encontrado };
  }
  return { success: false, message: 'Credenciales inválidas. Verifique su usuario y contraseña.' };
};