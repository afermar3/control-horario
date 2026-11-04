
# Mi Control Horario

Aplicación web personal para registrar las horas
trabajadas y calcular los saldos horarios.

## Funcionalidades

- Registro de horas en formato h:mm.
- Jornada de 8 horas de lunes a viernes.
- Registro de cualquier fecha anterior.
- Calendario mensual interactivo.
- Resumen de la semana seleccionada.
- Resumen de cualquier mes del año.
- Historial anual de los 12 meses.
- Saldo acumulado de todos los registros.
- Festivos, vacaciones y ausencias justificadas.
- Modificación y eliminación de registros.
- Configuración de saldo inicial.
- Copias de seguridad JSON.
- Diseño responsive para móvil y ordenador.

## Cálculo de horas

En cada día laborable registrado:

Saldo = Horas realizadas - 8 horas.

Los días festivos, vacaciones, descansos
y ausencias justificadas no generan deuda.

Los sábados y domingos no generan horas
obligatorias. Si se registran horas trabajadas
en ellos, se suman al saldo.

Los días sin registrar aparecen como pendientes
y no se incluyen en el saldo hasta que se
introduzcan sus datos.

## Tecnologías

- HTML5
- CSS3
- JavaScript
- LocalStorage

## Instalación

Abrir index.html en el navegador o utilizar
Live Server desde Visual Studio Code.

## Publicación

Compatible con GitHub Pages.

## Almacenamiento

Los datos se guardan localmente en el navegador.

Para sincronizar automáticamente entre dispositivos
será necesario añadir una base de datos en la nube,
por ejemplo Supabase.
