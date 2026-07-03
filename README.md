# Gestordered

Gestordered es una aplicación web desarrollada con **Spring Boot**, **Thymeleaf**, **Spring Security** y **MongoDB** para gestionar usuarios, roles, topologías de red y operaciones sobre una API externa de red.

El proyecto está pensado como panel de administración para un entorno SDN/Ryu-Mininet, permitiendo consultar topologías, gestionar operadores, revisar solicitudes de acceso y comunicarse con servicios externos de red mediante una API REST protegida.

## Características

* Aplicación web con Spring Boot.
* Interfaz HTML con Thymeleaf.
* Seguridad con Spring Security.
* Autenticación con usuarios almacenados en MongoDB.
* Roles de usuario: invitado, operador y administrador.
* Gestión de solicitudes de cambio de rol.
* Panel de administración para operadores.
* Gestión de topologías en formato JSON.
* Subida, guardado, descarga y eliminación de topologías.
* Proxy REST hacia una API externa de Ryu.
* Proxy REST hacia una API externa de Mininet.
* Integración con operaciones de red como consulta de topología, salud, STP, flujos, puertos, enlaces, hosts y pruebas de tráfico.

## Tecnologías utilizadas

* Java 21
* Spring Boot
* Spring Web MVC
* Spring Security
* Spring Data MongoDB
* Thymeleaf
* Maven
* MongoDB
* HTML
* CSS
* JavaScript

## Estructura del proyecto

```text
Gestordered/
├── .mvn/
│   └── wrapper/                     # Maven Wrapper
├── src/
│   ├── main/
│   │   ├── java/es/unex/cume/gestodered/
│   │   │   ├── config/              # Configuración de seguridad, MongoDB e inicialización
│   │   │   ├── controller/          # Controladores MVC y proxy REST
│   │   │   ├── data/
│   │   │   │   ├── model/           # Modelos de dominio
│   │   │   │   └── repository/      # Repositorios MongoDB
│   │   │   ├── service/             # Lógica de negocio
│   │   │   └── GestoderedApplication.java
│   │   └── resources/
│   │       ├── static/              # CSS, JS, imágenes y animaciones
│   │       ├── templates/           # Vistas Thymeleaf
│   │       └── application.properties
│   └── test/
├── mvnw
├── mvnw.cmd
├── pom.xml
└── .gitignore
```

## Ramas del repositorio

| Rama        | Descripción                                                                              |
| ----------- | ---------------------------------------------------------------------------------------- |
| `main`      | Rama principal del proyecto. Contiene la versión más completa y actual de la aplicación. |
| `developer` | Rama de desarrollo para cambios en progreso antes de integrarlos en `main`.              |

Para cambiar de rama:

```bash
git checkout nombre-de-la-rama
```

Ejemplo:

```bash
git checkout developer
```

## Requisitos previos

Antes de ejecutar el proyecto necesitas:

* Java 21
* MongoDB
* Git
* Maven o Maven Wrapper
* Una API Ryu en `http://127.0.0.1:8080`
* Una API Mininet en `http://127.0.0.1:8081`

El proyecto incluye Maven Wrapper, así que no es obligatorio instalar Maven globalmente.

## Instalación

Clona el repositorio:

```bash
git clone https://github.com/Viictoor29/Gestordered.git
cd Gestordered
```

Comprueba que estás en la rama principal:

```bash
git checkout main
```

## Configuración de MongoDB

La aplicación espera una base de datos MongoDB llamada `gestor_bd`.

Configuración por defecto usada por el proyecto:

```properties
spring.mongodb.uri=mongodb://admin:admin@localhost:27017/gestor_bd?authSource=gestor_bd
spring.data.mongodb.auto-index-creation=true
server.port=8082
```

Para crear la base de datos y el usuario manualmente:

```bash
mongosh
```

Dentro de la consola de MongoDB:

```javascript
use gestor_bd

db.createUser({
  user: "admin",
  pwd: "admin",
  roles: [
    { role: "readWrite", db: "gestor_bd" }
  ]
})
```

> Importante: las credenciales `admin/admin` son útiles para desarrollo local, pero no deberían usarse en producción.

## Configuración de servicios externos

Gestordered actúa como panel intermedio entre el usuario y servicios de red externos.

Valores por defecto:

```properties
gestordered.ryu-api-url=http://127.0.0.1:8080
gestordered.mininet-api-url=http://127.0.0.1:8081
gestordered.network-api-key=gestordered-tfg-network-api-key-2026
```

También puedes sobrescribirlos al arrancar la aplicación:

```bash
./mvnw spring-boot:run \
  -Dspring-boot.run.arguments="\
--gestordered.ryu-api-url=http://127.0.0.1:8080 \
--gestordered.mininet-api-url=http://127.0.0.1:8081 \
--gestordered.network-api-key=mi-clave-api"
```

## Ejecución

En Linux o macOS:

```bash
./mvnw spring-boot:run
```

En Windows:

```bash
mvnw.cmd spring-boot:run
```

Una vez iniciada la aplicación, abre:

```text
http://localhost:8082
```

## Compilación

Para compilar el proyecto:

```bash
./mvnw clean package
```

El archivo `.jar` se generará en:

```text
target/
```

Para ejecutar el `.jar`:

```bash
java -jar target/gestodered-0.0.1-SNAPSHOT.jar
```

## Tests

Para ejecutar las pruebas:

```bash
./mvnw test
```

## Usuarios y roles

La aplicación trabaja con varios niveles de acceso:

| Rol        | Descripción                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `GUEST`    | Usuario invitado. Puede consultar información pública y solicitar acceso.                           |
| `OPERATOR` | Usuario operador. Puede consultar y ejecutar operaciones de red permitidas.                         |
| `ADMIN`    | Usuario administrador. Puede gestionar operadores, solicitudes, topologías y operaciones avanzadas. |

Durante el arranque, el proyecto inicializa usuarios de prueba en MongoDB si no existen. Las contraseñas se almacenan cifradas con BCrypt.

Si no conoces las contraseñas de esos usuarios, puedes crear nuevos usuarios manualmente en MongoDB, modificar el inicializador o añadir una funcionalidad de registro propia.

## Rutas principales de la aplicación web

| Ruta                    | Descripción                                          |
| ----------------------- | ---------------------------------------------------- |
| `/`                     | Página principal e inicio de sesión.                 |
| `/login`                | Procesamiento del login.                             |
| `/guest`                | Acceso de invitado.                                  |
| `/register`             | Página de registro.                                  |
| `/forgot-password`      | Página de recuperación de contraseña.                |
| `/dashboard`            | Panel principal tras iniciar sesión.                 |
| `/dashboard/profile`    | Gestión del perfil del usuario.                      |
| `/dashboard/operators`  | Gestión de operadores.                               |
| `/dashboard/topologies` | Gestión de topologías.                               |
| `/dashboard/admin`      | Administración de solicitudes y funciones avanzadas. |

## Funcionalidades del panel

### Perfil

Los usuarios autenticados pueden actualizar:

* Nombre completo.
* Nombre de usuario.
* Email.
* DNI.
* Teléfono.
* Contraseña.

### Operadores

Los administradores pueden:

* Crear operadores.
* Listar operadores existentes.
* Eliminar operadores.
* Validar la contraseña de administrador antes de acciones sensibles.

### Solicitudes de rol

Los invitados pueden solicitar acceso como operadores.

Los operadores pueden solicitar permisos de administrador.

Los administradores pueden:

* Ver solicitudes.
* Filtrar solicitudes por estado, rol o búsqueda.
* Aprobar solicitudes.
* Rechazar solicitudes indicando una justificación.

Estados disponibles:

```text
PENDING
APPROVED
REJECTED
```

### Topologías

Los administradores pueden:

* Subir topologías desde archivos JSON.
* Guardar topologías desde el panel.
* Descargar topologías.
* Eliminar topologías.
* Consultar número de nodos y enlaces detectados.

## Acceso de invitado

Los invitados pueden acceder a información limitada mediante rutas públicas:

```text
/guest
/guest/api/topology
/guest/api/mininet/status
/guest/role-requests
/guest/role-requests/status
```

Esto permite consultar parte del estado de la red y enviar solicitudes de acceso sin iniciar sesión.

## Ejemplo de uso con API de red

Si tienes una API Ryu escuchando en `8080` y una API Mininet en `8081`, inicia Gestordered:

```bash
./mvnw spring-boot:run
```

Después abre:

```text
http://localhost:8082
```

Desde el panel puedes consultar la topología, ver el estado de la red, lanzar operaciones y administrar topologías guardadas.

También puedes probar una ruta directamente:

```bash
curl http://localhost:8082/api/topology
```

Para rutas protegidas, inicia sesión primero desde el navegador.

## Variables de configuración recomendadas

En desarrollo puedes usar `application.properties`.

En producción es mejor usar variables de entorno o argumentos de arranque.

Ejemplo:

```bash
java -jar target/gestodered-0.0.1-SNAPSHOT.jar \
  --server.port=8082 \
  --gestordered.ryu-api-url=http://127.0.0.1:8080 \
  --gestordered.mininet-api-url=http://127.0.0.1:8081 \
  --gestordered.network-api-key=clave-segura
```

## Seguridad

Recomendaciones antes de desplegar:

* Cambiar la clave `gestordered.network-api-key`.
* Cambiar credenciales de MongoDB.
* No usar usuarios de prueba en producción.
* Activar CSRF si se va a desplegar fuera de un entorno controlado.
* Usar HTTPS.
* Revisar la configuración de sesiones y cookies.
* Evitar exponer APIs internas sin autenticación.
* No almacenar secretos directamente en `application.properties`.

## Desarrollo

Para añadir nuevas vistas:

1. Crear el HTML en `src/main/resources/templates/`.
2. Añadir estilos en `src/main/resources/static/css/`.
3. Añadir scripts en `src/main/resources/static/js/`.
4. Crear o ampliar un controlador en `controller/`.

Para añadir nueva lógica de negocio:

1. Crear o modificar un servicio en `service/`.
2. Añadir el modelo en `data/model/` si hace falta persistencia.
3. Crear un repositorio en `data/repository/`.
4. Exponer la funcionalidad desde un controlador.

Para añadir nuevos endpoints proxy hacia la API de red:

1. Modificar `NetworkApiController`.
2. Añadir la ruta interna deseada.
3. Delegar la llamada mediante `NetworkApiClient`.
4. Proteger la ruta según el rol correspondiente.

## Comandos útiles

Arrancar aplicación:

```bash
./mvnw spring-boot:run
```

Compilar:

```bash
./mvnw clean package
```

Ejecutar JAR:

```bash
java -jar target/gestodered-0.0.1-SNAPSHOT.jar
```

Limpiar compilación:

```bash
./mvnw clean
```

## Posibles problemas

### No conecta con MongoDB

Comprueba que MongoDB está arrancado:

```bash
mongosh
```

Comprueba que la base de datos y el usuario existen:

```javascript
use gestor_bd
db.getUsers()
```

La aplicación no abre en el navegador

Comprueba el puerto configurado en el archivo:

src/main/resources/application.properties

La aplicación usa el valor definido en la propiedad:

server.port=8082

Por defecto, si el puerto está configurado como 8082, debes abrir:

http://localhost:8082

Si quieres usar otro puerto, modifica el valor de server.port en application.properties. Por ejemplo:

server.port=8083

Después reinicia la aplicación y accede desde el navegador a:

http://localhost:8083

### No se puede consultar la topología

Comprueba que la API Ryu está activa:

```text
http://127.0.0.1:8080
```

Y que la propiedad apunta a la URL correcta:

```properties
gestordered.ryu-api-url=http://127.0.0.1:8080
```

### No responde Mininet

Comprueba que la API Mininet está activa:

```text
http://127.0.0.1:8081
```

Y que la propiedad apunta a la URL correcta:

```properties
gestordered.mininet-api-url=http://127.0.0.1:8081
```

