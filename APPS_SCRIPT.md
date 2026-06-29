# Instrucciones para activar la subida a Google Drive

Para que la aplicación pueda subir fotos automáticamente a tu carpeta de Google Drive, necesitamos crear un pequeño "puente" (script) gratuito en Google.

### Paso 1: Crear el Script
1. Ve a [script.google.com](https://script.google.com/) e inicia sesión con tu cuenta de Google.
2. Haz clic en **"Nuevo proyecto"**.
3. Borra todo el código que aparece y pega el siguiente:

```javascript
function doPost(e) {
  try {
    // ID de tu carpeta de Drive (extraído de tu enlace)
    var folderId = "169eyIV4TBKByEQtfNKIXaT2m_kNxcQ7g"; 
    
    var data = Utilities.base64Decode(e.parameter.data);
    var blob = Utilities.newBlob(data, e.parameter.mimeType, e.parameter.filename);
    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);
    
    // Hacer el archivo público para que se vea en la app
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingError) {
      // Ignorar error de permisos de compartir si está deshabilitado por las políticas de tu organización/Workspace
    }
    
    // Generar enlace directo de visualización
    var fileId = file.getId();
    var directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'success', 
      url: directUrl 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'error', 
      message: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

### Paso 2: Publicar el Script
1. Arriba a la derecha, haz clic en el botón azul **"Implementar"** > **"Nueva implementación"**.
2. En la ventana que se abre:
   - **Tipo**: Selecciona "Aplicación web" (icono de engranaje).
   - **Descripción**: "Subida Fotos Mambo".
   - **Ejecutar como**: "Yo" (tu email).
   - **Quién tiene acceso**: **"Cualquier usuario"** (Importante: selecciona la última opción).
3. Haz clic en **"Implementar"**.
4. Te pedirá permisos. Autoriza el acceso (si sale "Google no ha verificado esta aplicación", dale a "Configuración avanzada" > "Ir a... (no seguro)").

### Paso 3: Copiar la URL
1. Al terminar, te dará una **"URL de la aplicación web"**.
2. Copia esa URL.
3. Ve a tu archivo `.env` en este proyecto y pégala en la variable `VITE_DRIVE_SCRIPT_URL`.

Ejemplo en `.env`:
`VITE_DRIVE_SCRIPT_URL=https://script.google.com/macros/s/AKfycbx.../exec`
