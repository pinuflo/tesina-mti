# Sistema de Sugerencias de Menú Real

## Descripción

Este módulo permite generar sugerencias de menú con platos reales basándose en las porciones de macronutrientes asignadas en el plan semanal.

## Componentes

### 1. Catálogo de Comidas (`meal-recipes.json`)

Archivo JSON con ~66 platos reales argentinos e internacionales, incluyendo:
- Desayunos (10 opciones)
- Almuerzos/Cenas (30+ opciones)
- Colaciones (10+ opciones)
- Vegetales y ensaladas (8 opciones)
- Grasas saludables (5 opciones)
- Platos completos (5 opciones)

Cada plato incluye:
```typescript
{
  id: string;
  nombre: string;
  macroDominante: 'proteina' | 'carbohidrato' | 'grasa' | 'mixto';
  calorias: number;
  proteinas: number;
  carbohidratos: number;
  grasas: number;
  porcionGramos: number;
  tiemposAptos: ('desayuno' | 'media_manana' | 'almuerzo' | 'colacion' | 'cena')[];
  categoria?: string;
  origen?: string;
  fuente: 'usda' | 'openfoodfacts' | 'themealdb' | 'manual';
}
```

### 2. MealCatalogService

Servicio que gestiona el catálogo y provee funcionalidad de búsqueda y sugerencias.

**Métodos principales:**

- `getAllMeals()`: Obtiene todos los platos
- `getMealsByTime(mealTime)`: Filtra por tiempo de comida
- `getMealsByMacro(macro)`: Filtra por macro dominante
- `searchMealsByName(query)`: Búsqueda por nombre
- `suggestMealsForTime(mealTimePlan, tolerance)`: Sugiere platos para un tiempo específico
- `suggestFullMenu(meals)`: Sugiere menú completo para el día
- `getCatalogStats()`: Obtiene estadísticas del catálogo

**Algoritmo de sugerencias:**

1. Calcula los totales de macros del plan de porciones
2. Busca platos aptos para ese tiempo de comida
3. Calcula un score de similaridad basado en:
   - Calorías (peso: 40%)
   - Proteínas (peso: 20%)
   - Carbohidratos (peso: 20%)
   - Grasas (peso: 20%)
4. Retorna los 3 platos con mejor score (tolerancia por defecto: ±15%)

### 3. Integración en EvaluacionComponent

**Nuevos métodos:**

- `sugerirMenuReal()`: Genera sugerencias para el plan actual
- `toggleMealSuggestions()`: Alterna visibilidad del panel
- `closeMealSuggestions()`: Cierra el panel de sugerencias

**Flujo de uso:**

1. Armar plan de macros arrastrando porciones o usando "Sugerir pauta"
2. Click en "Sugerir menú real"
3. Se muestra panel con 3 sugerencias por tiempo de comida
4. Cada sugerencia muestra:
   - Nombre del plato
   - Macros (P/C/G + calorías)
   - Porción en gramos
   - Origen del plato
   - Totales sumados

## Generación del Catálogo

### Regenerar el catálogo

```bash
npm run generate-meals
```

El script `scripts/generate-meal-catalog.js`:
1. Parte de un catálogo base hardcoded de 66 platos
2. (Opcional) Complementa con datos de USDA API
3. Genera `src/app/data/meal-recipes.json`

### Agregar nuevos platos

Editar `scripts/extended-meals.js` y agregar objetos al array `EXTENDED_HARDCODED_MEALS`:

```javascript
{
  id: 'hc-custom-001',
  nombre: 'Mi plato personalizado',
  macroDominante: 'proteina',
  calorias: 250,
  proteinas: 30,
  carbohidratos: 15,
  grasas: 8,
  porcionGramos: 180,
  tiemposAptos: ['almuerzo', 'cena'],
  categoria: 'Carne',
  origen: 'Argentina',
  fuente: 'manual'
}
```

Luego ejecutar `npm run generate-meals` para regenerar el JSON.

## Estadísticas del Catálogo Actual

**Total de platos:** 66

**Por macro dominante:**
- Proteína: 23 platos
- Carbohidrato: 35 platos
- Grasa: 8 platos

**Por tiempo de comida:**
- Desayuno: 23 platos
- Media mañana: 14 platos
- Almuerzo: 40 platos
- Colación: 22 platos
- Cena: 40 platos

**Por origen:**
- Argentina: ~15 platos
- Internacional: ~45 platos
- Oriental: ~6 platos

## Configuración TypeScript

Para importar JSON, se agregó a `tsconfig.json`:

```json
{
  "compilerOptions": {
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  }
}
```

## Mejoras Futuras

1. **Integración con API en vivo** (USDA/Open Food Facts)
2. **Filtros adicionales:**
   - Vegetariano/vegano
   - Sin gluten/sin lactosa
   - Por origen cultural
3. **Puntuación por preferencias del paciente**
4. **Generación de lista de compras**
5. **Exportar menú a PDF**
6. **Historial de menús sugeridos**
7. **Variaciones de platos según temporada**

## Archivos Principales

- `src/app/models/nutricion.models.ts` - Interfaces RealMeal y MealSuggestion
- `src/app/services/meal-catalog.service.ts` - Lógica de catálogo y sugerencias
- `src/app/data/meal-recipes.json` - Catálogo de platos (generado)
- `scripts/generate-meal-catalog.js` - Script de generación
- `scripts/extended-meals.js` - Catálogo base hardcoded
- `src/app/evaluacion/evaluacion.component.*` - UI de sugerencias
