# 🔐 Sistema de Autenticación - Gestor de Red

## Descripción General

El sistema de autenticación de Gestor de Red utiliza **BCrypt**, un algoritmo de hash criptográfico avanzado para proteger las contraseñas de los usuarios. Las contraseñas NUNCA se almacenan en texto plano en la base de datos.

---

## 🏗️ Arquitectura

### Capas Implementadas

```
┌─────────────────────────────────────┐
│   HomeController (Login/Logout)      │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   UserService (Lógica de Auth)      │
│  - authenticate()                   │
│  - createUser()                     │
│  - encodePassword()                 │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   BCryptPasswordEncoder             │
│   (Cifrado de contraseñas)          │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   UserRepository (MongoDB)          │
│   (Acceso a datos)                  │
└─────────────────────────────────────┘
```

---

## 🔑 ¿Cómo Funciona BCrypt?

### Registro de Usuario

```
1. Usuario escribe: "MiContraseña123!"
                        ↓
2. Se envía por HTTPS al servidor
                        ↓
3. BCryptPasswordEncoder genera hash:
   $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86xVXAaxm7m
                        ↓
4. SOLO el hash se almacena en MongoDB
```

### Login (Autenticación)

```
1. Usuario escribe: "MiContraseña123!"
                        ↓
2. Se envía por HTTPS al servidor
                        ↓
3. BCryptPasswordEncoder.matches() compara:
   - La contraseña ingresada
   - Con el hash almacenado en la BD
                        ↓
4. Si coinciden → Usuario autenticado ✓
   Si no coinciden → Acceso denegado ✗
```

---

## 📁 Ficheros Relevantes

### Java Classes

#### `UserService.java`
```java
// Método principal de autenticación
User authenticate(String username, String password)
```
- Busca el usuario en la BD por username
- Compara la contraseña ingresada con el hash almacenado
- Devuelve el usuario si es correcto, null en caso contrario

#### `HomeController.java`
```java
@PostMapping("/login")
public String login(@RequestParam String username, 
                   @RequestParam String password, ...)
```
- Recibe las credenciales del formulario
- Llama a `userService.authenticate()`
- Crea sesión si la autenticación es exitosa
- Redirige con error si falla

#### `SecurityConfig.java`
```java
@Bean
public BCryptPasswordEncoder passwordEncoder()
```
- Configura y proporciona el encoder BCrypt como Bean
- Se inyecta automáticamente donde sea necesario

#### `DataInitializer.java`
```java
CommandLineRunner initializeData(...)
```
- Crea usuarios de prueba al iniciar la aplicación
- Almacena contraseñas cifradas en la BD
- Útil para desarrollo y testing

### Templates HTML

#### `login.html`
- Formulario de login con validación
- Enlace a información de seguridad
- Manejo de errores de autenticación

#### `security-info.html`
- Página informativa sobre BCrypt
- Explica cómo se protegen las contraseñas
- Recomendaciones de seguridad
- Ejemplos visuales

---

## 🚀 Usuarios de Prueba

Al iniciar la aplicación, se crean automáticamente 2 usuarios de prueba:

### Usuario 1: Admin
```
Username:  admin
Password:  admin123
Email:     admin@gestordered.com
```

### Usuario 2: Usuario Regular
```
Username:  usuario
Password:  usuario123
Email:     usuario@gestordered.com
```

**Nota:** Estos usuarios se crean solo si no existen previamente en la BD.

---

## 🔧 Flujo de Autenticación Completo

### 1. Request de Login
```
POST /login
├── username: "admin"
├── password: "admin123"
└── remember: "true" (opcional)
```

### 2. Procesamiento en HomeController
```java
@PostMapping("/login")
public String login(...) {
    // 1. Validar entrada
    if (username.isEmpty() || password.isEmpty()) 
        return error;
    
    // 2. Llamar al servicio
    User user = userService.authenticate(username, password);
    
    // 3. Si autenticado
    if (user != null) {
        session.setAttribute("user", user);
        return redirect("/dashboard");
    }
    
    // 4. Si no autenticado
    return redirect("/login?error=...");
}
```

### 3. Procesamiento en UserService
```java
public User authenticate(String username, String password) {
    // 1. Buscar usuario en BD
    Optional<User> userOpt = userRepository.findByUsername(username);
    
    if (userOpt.isPresent()) {
        User user = userOpt.get();
        
        // 2. Validar contraseña con BCrypt
        if (passwordEncoder.matches(password, user.getPasswordHash())) {
            return user; // ✓ Autenticado
        }
    }
    return null; // ✗ No autenticado
}
```

### 4. Respuesta
```
Si exitoso:
  - Sesión creada
  - Redirect a /dashboard
  
Si falla:
  - Redirect a /login?error=Usuario o contraseña incorrectos
```

---

## 🔒 Características de Seguridad

### ✅ BCrypt

| Característica | Descripción |
|---|---|
| **Lento intencionalmente** | Cada hash tarda ~100ms, imposible romper por fuerza bruta |
| **Adaptativo** | El coste se puede aumentar con el tiempo |
| **Con Salt** | Cada hash incluye 16 bytes aleatorios |
| **Unidireccional** | No se puede desencriptar, solo verificar |

### ✅ HTTPS
- Todas las conexiones están cifradas
- Las contraseñas nunca viajan en texto plano

### ✅ Sesiones
- Se crean después de autenticación exitosa
- Se invalidan al logout

### ✅ Validación del lado del servidor
- Todas las validaciones ocurren en el servidor
- No se confía en validaciones del cliente

---

## 📊 Estructura de Datos (MongoDB)

### Documento User
```json
{
  "_id": ObjectId("..."),
  "username": "admin",
  "fullName": "Administrador",
  "email": "admin@gestordered.com",
  "dni": null,
  "phone": null,
  "passwordHash": "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86xVXAaxm7m",
  "role": "ADMIN",
  "enabled": true,
  "createdAt": ISODate("2026-05-22T..."),
  "updatedAt": ISODate("2026-05-22T...")
}
```

**Nota:** El campo `passwordHash` NUNCA contiene la contraseña en texto plano.

---

## 🔍 Ejemplo de Hashes BCrypt

Misma contraseña, hashes diferentes (por el salt aleatorio):

```
Contraseña original: "admin123"

Hash 1: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86xVXAaxm7m
Hash 2: $2a$10$JqcDr9Vk2x8Y7nL4mP5QqeIjZAgcg7b3XeKeUxWdeS86xVXAaxm9k
Hash 3: $2a$10$KmfEr2Xq1a9Z8oM6nQ6RrfIjZAgcg7b3XeKeUxWdeS86xVXAaxm0l

Cada hash es único, pero todos verifican la misma contraseña
```

---

## 🛡️ Recomendaciones de Seguridad

### Para Usuarios
1. ✅ Usa contraseñas fuertes (>8 caracteres, mayúsculas, números, símbolos)
2. ✅ No compartas tu contraseña con nadie
3. ✅ Cambia tu contraseña regularmente
4. ✅ Cierra sesión cuando termines
5. ✅ No uses contraseñas predecibles

### Para Desarrolladores
1. ✅ Nunca registres contraseñas en logs
2. ✅ Usa HTTPS en producción
3. ✅ Valida entrada del lado del servidor
4. ✅ Usa prepared statements contra SQL injection
5. ✅ Implementa rate limiting en login
6. ✅ Implementa 2FA para cuentas críticas

---

## 🔗 Enlaces Útiles

- [BCrypt Wikipedia](https://en.wikipedia.org/wiki/Bcrypt)
- [Spring Security Documentation](https://spring.io/projects/spring-security)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

---

## 📝 Notas

- El DataInitializer solo se ejecuta si la aplicación no encuentra los usuarios
- Para limpiar la BD de prueba y crear nuevos usuarios: borrar collection "users" en MongoDB
- El rolesystem está preparado pero no completamente implementado
- TODO: Implementar 2FA (Two-Factor Authentication)
- TODO: Implementar "Remember Me" con cookies seguras

---

**Última actualización:** Mayo 2026  
**Versión:** 1.0  
**Estado:** ✅ Funcional
