**Lista de Comandos de ClientesT1Bot y sus Argumentos**

### **Roles de Usuario:**

-   **OWNER:** Máximo nivel de acceso. Puede gestionar todos los clientes y asignar roles.
    
-   **ADMINISTRADOR:** Gestión completa de sus propios clientes (añadir, listar, ver, actualizar, eliminar). No puede asignar roles.
    
-   **MODERADOR:** Puede añadir, actualizar, listar y ver detalles de sus propios clientes. No puede eliminar ni asignar roles.
    
-   **USUARIO:** Consumidor final. Solo puede ver los detalles de su propio servicio vinculado.
    

___

### **Comandos Generales**

-   `/start`
    
    -   **Función:** Inicia la interacción con el bot y muestra tu estado.
        
    -   **Roles:** Todos.
        
    -   **Argumentos:** Ninguno.
        
-   `/menu`
    
    -   **Función:** Muestra el menú principal de comandos del bot.
        
    -   **Roles:** Todos.
        
    -   **Argumentos:** Ninguno.
        
-   `/info`
    
    -   **Función:** Muestra una guía de los comandos disponibles y la información de contacto.
        
    -   **Roles:** Todos.
        
    -   **Argumentos:** Ninguno.
        
-   `/mimbre [tu nombre]`
    
    -   **Función:** Establece o cambia tu nombre de usuario en el bot.
        
    -   **Roles:** Todos.
        
    -   **Argumentos:**
        
        -   `[tu nombre]`: El nombre que deseas usar (ej: `Juan Perez`).
            

___

### **Comandos de Gestión de Clientes y Productos**

-   `/addclient`
    
    -   **Función:** Inicia un proceso interactivo para añadir un nuevo cliente y su primer producto.
        
    -   **Roles:** OWNER, ADMINISTRADOR, MODERADOR.
        
    -   **Argumentos:** Ninguno (interactivo).
        
-   `/addproduct`
    
    -   **Función:** Inicia un proceso interactivo para añadir un nuevo producto a un cliente ya existente.
        
    -   **Roles:** OWNER, ADMINISTRADOR, MODERADOR.
        
    -   **Argumentos:** Ninguno (interactivo).

-   `/listclients [filtros]`
    
    -   **Función:** Muestra una lista de clientes y sus productos, con filtros opcionales.
        
    -   **Roles:** OWNER, ADMINISTRADOR, MODERADOR.
        
    -   **Argumentos de Filtro (opcionales, formato `clave=valor`):**
        
        -   `status=[estado]` (Ej: `Activa`, `Vencida`)
        -   `product=[nombre_producto]` (Ej: `Netflix`)
        -   `month=[número_mes]` (Ej: `07`)
        -   `year=[año]` (Ej: `2025`)
            
    -   **Ejemplos:** `/listclients status=Activa product=Netflix`
            
-   `/client [ID_o_Nombre]`
    
    -   **Función:** Muestra todos los detalles de un cliente específico y todos sus productos.
        
    -   **Roles:** OWNER, ADMINISTRADOR, MODERADOR.
        
    -   **Argumentos:**
        
        -   `[ID_o_Nombre]`: El ID (ej: `clt_a1b2c3d4`) o nombre del cliente.
            
-   `/updateclient`
    
    -   **Función:** Inicia un proceso interactivo para actualizar la información general de un cliente o los detalles de un producto específico.
        
    -   **Roles:** OWNER, ADMINISTRADOR, MODERADOR.
        
    -   **Argumentos:** Ninguno (interactivo).
        

___

### **Comandos de Eliminación**

-   `/delclient`
    
    -   **Función:** Inicia un proceso interactivo para eliminar un cliente completo (incluyendo todos sus productos).
        
    -   **Roles:** OWNER, ADMINISTRADOR.
        
    -   **Argumentos:** Ninguno (interactivo).
        
-   `/delproduct`
    
    -   **Función:** Inicia un proceso interactivo para eliminar un producto específico de un cliente.
        
    -   **Roles:** OWNER, ADMINISTRADOR, MODERADOR.
        
    -   **Argumentos:** Ninguno (interactivo).
            

___

### **Comandos de Gestión de Roles**

-   `/setrole [ID_Usuario] [nuevo_rol]`
    
    -   **Función:** Asigna un rol a un usuario.
        
    -   **Roles:** SOLO OWNER.
        
    -   **Argumentos:**
        
        -   `[ID_Usuario]`: El ID numérico del usuario de Telegram.
        -   `[nuevo_rol]`: `owner`, `administrador`, `moderador`, `usuario`.
                

___

### **Comandos para el Usuario Final (Consumidor)**

-   `/presente [ID_Cliente]`
    
    -   **Función:** Vincula tu usuario de Telegram a un ID de cliente para ver tus servicios.
        
    -   **Roles:** Todos.
        
    -   **Argumentos:**
        
        -   `[ID_Cliente]`: El ID de tu servicio (ej: `clt_a1b2c3d4`).
            
-   `/misproductos`
    
    -   **Función:** Muestra los detalles de tus servicios vinculados.
        
    -   **Roles:** USUARIO (que se haya presentado).
        
    -   **Argumentos:** Ninguno.

    - `/renew`
    - **Función:** Inicia un proceso interactivo para renovar un producto existente de un cliente, actualizando su fecha de vencimiento.
    - **Roles:** OWNER, ADMINISTRADOR, MODERADOR.
    - **Argumentos:** Ninguno (interactivo).

    ___

### **Comandos de Reportes**

- `/stats`
    - **Función:** Muestra un resumen estadístico de clientes y productos.
    - **Roles:** OWNER, ADMINISTRADOR.
    - **Argumentos:** Ninguno.

    ___

### **Comandos de Administración**

- `/backup`
    - **Función:** Genera y envía un archivo JSON con una copia de seguridad completa de todos los clientes y sus productos.
    - **Roles:** SOLO OWNER.
    - **Argumentos:** Ninguno.

    - `/restore`
    - **Función:** Inicia un proceso interactivo para restaurar clientes desde un archivo de backup `.json`.
    - **Roles:** SOLO OWNER.
    - **Argumentos:** Ninguno (interactivo, pide un archivo).