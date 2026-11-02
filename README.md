# GymPlan 🏋️

Web para planificar y registrar tus días de gimnasio. Hecha con React + Vite y lista para Vercel.

## Qué hace

- **Rutina inteligente**: le dices cuántos días vas, tu objetivo, tu nivel y tu equipo, y arma la rutina
  (cuerpo completo, empuje/tirón/pierna, torso/pierna o por grupo muscular).
- **Tu día propio**: si ya tienes un día armado, lo marcas como "mi día" y el generador detecta qué músculos
  trabaja y arma los demás días alrededor de él para que no se repitan músculos. Ese día no cambia al regenerar.
- **Tú eliges las series**: series, rango de repeticiones y descanso de cada ejercicio. También hay un botón
  "series para todos" y una preferencia general (Auto, 2, 3, 4 o 5).
- **Banco de más de 120 ejercicios** con técnica, dificultad y equipo. Con "Cambiar" ves los mejores
  reemplazos (mismo movimiento, otro equipo…). Si marcas "No me gusta", no se vuelve a sugerir.
  Puedes marcar favoritos y crear tus propios ejercicios.
- **Análisis de la rutina**: series por semana de cada músculo frente al rango recomendado, equilibrio entre
  pecho y espalda, sesiones demasiado largas, y un botón para corregir lo que falta.
- **Planificación semanal**: cada semana eliges qué días vas (o "Planificar automático"). Los días de rutina
  se asignan en orden, siguiendo desde donde te quedaste. Avisa si trabajas el mismo músculo dos días seguidos.
- **Modo entrenamiento**: registras kilos y repeticiones de cada serie, con temporizador de descanso (sonido y
  vibración), sugerencia de peso por doble progresión ("sube a 62,5 kg"), récords nuevos y pantalla siempre encendida.
- **Peso por mes con gráfico**: promedio mensual, cambio frente al mes anterior, IMC, peso meta y estimación
  de cuándo llegas a la meta.
- Funciona sin internet (PWA) y se puede instalar en el celular ("Agregar a pantalla de inicio").

Los datos se guardan en el navegador del dispositivo. En **Ajustes** puedes descargar un respaldo (.json) y
restaurarlo en otro celular.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm run build    # compila a dist/
```

## Despliegue en Vercel

El proyecto está conectado al repositorio: cada push a `main` se publica solo.
Vercel detecta Vite automáticamente (comando `npm run build`, carpeta `dist`).
