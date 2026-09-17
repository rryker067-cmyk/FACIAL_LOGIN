// src/services/googleAuthService.ts

export interface GoogleAccount {
  email: string;
  name: string;
  picture?: string;
}

// Simula la ventana de selección de cuentas de Google Workspace
export const promptGoogleAccountSelection = (): Promise<GoogleAccount> => {
  return new Promise((resolve, reject) => {
    // Simulamos un selector modal o prompt del navegador para elegir cuenta
    const inputEmail = prompt(
      'Google Workspace - Seleccione o ingrese su cuenta corporativa de correo:',
      'usuario@empresa.com'
    );

    if (!inputEmail) {
      reject(new Error('Inicio de sesión con Google cancelado por el usuario.'));
      return;
    }

    // Extraemos un nombre legible basado en el correo ingresado
    const namePart = inputEmail.split('@')[0];
    const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    // Retornamos los datos de la cuenta seleccionada
    resolve({
      email: inputEmail,
      name: `${formattedName} (Google)`,
      picture: 'https://lh3.googleusercontent.com/a/ACg8ocI...' // Placeholder o avatar genérico
    });
  });
};