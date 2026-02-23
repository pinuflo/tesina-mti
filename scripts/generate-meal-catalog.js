#!/usr/bin/env node

/**
 * Script para generar un catálogo de comidas reales desde APIs públicas
 * 
 * APIs utilizadas:
 * - USDA FoodData Central (requiere API key gratuita)
 * - Open Food Facts (sin autenticación)
 * - TheMealDB (API gratuita)
 * 
 * Modo de uso:
 * 1. Exportar USDA_API_KEY con tu clave de https://fdc.nal.usda.gov/api-key-signup.html
 * 2. node scripts/generate-meal-catalog.js
 * 
 * Salida: src/app/data/meal-recipes.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { EXTENDED_HARDCODED_MEALS } = require('./extended-meals.js');

const USDA_API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';
const OUTPUT_PATH = path.join(__dirname, '../src/app/data/meal-recipes.json');

// Configuración de platos base con búsquedas específicas
const MEAL_SEARCHES = {
  desayuno: [
    { query: 'scrambled eggs', nombre: 'Huevos revueltos', macroDominante: 'proteina' },
    { query: 'oatmeal', nombre: 'Avena cocida', macroDominante: 'carbohidrato' },
    { query: 'yogurt greek', nombre: 'Yogur griego natural', macroDominante: 'proteina' },
    { query: 'whole wheat toast', nombre: 'Tostada integral', macroDominante: 'carbohidrato' },
    { query: 'banana', nombre: 'Banana', macroDominante: 'carbohidrato' },
    { query: 'avocado', nombre: 'Palta', macroDominante: 'grasa' },
    { query: 'omelet', nombre: 'Omelette', macroDominante: 'proteina' },
    { query: 'smoothie protein', nombre: 'Batido proteico', macroDominante: 'proteina' },
    { query: 'granola', nombre: 'Granola', macroDominante: 'carbohidrato' },
    { query: 'cottage cheese', nombre: 'Queso cottage', macroDominante: 'proteina' },
  ],
  almuerzo: [
    { query: 'chicken breast grilled', nombre: 'Pechuga de pollo a la plancha', macroDominante: 'proteina' },
    { query: 'salmon baked', nombre: 'Salmón al horno', macroDominante: 'proteina' },
    { query: 'brown rice cooked', nombre: 'Arroz integral cocido', macroDominante: 'carbohidrato' },
    { query: 'quinoa cooked', nombre: 'Quinoa cocida', macroDominante: 'carbohidrato' },
    { query: 'sweet potato baked', nombre: 'Batata al horno', macroDominante: 'carbohidrato' },
    { query: 'beef steak', nombre: 'Bife de res', macroDominante: 'proteina' },
    { query: 'tuna canned', nombre: 'Atún al natural', macroDominante: 'proteina' },
    { query: 'lentils cooked', nombre: 'Lentejas cocidas', macroDominante: 'proteina' },
    { query: 'pasta whole wheat', nombre: 'Pasta integral', macroDominante: 'carbohidrato' },
    { query: 'chickpeas cooked', nombre: 'Garbanzos cocidos', macroDominante: 'proteina' },
    { query: 'turkey breast', nombre: 'Pechuga de pavo', macroDominante: 'proteina' },
    { query: 'tilapia cooked', nombre: 'Tilapia cocida', macroDominante: 'proteina' },
  ],
  cena: [
    { query: 'chicken breast grilled', nombre: 'Pollo a la plancha', macroDominante: 'proteina' },
    { query: 'fish white cooked', nombre: 'Pescado blanco', macroDominante: 'proteina' },
    { query: 'vegetables mixed cooked', nombre: 'Vegetales mixtos cocidos', macroDominante: 'carbohidrato' },
    { query: 'broccoli steamed', nombre: 'Brócoli al vapor', macroDominante: 'carbohidrato' },
    { query: 'salad mixed greens', nombre: 'Ensalada verde mixta', macroDominante: 'carbohidrato' },
    { query: 'soup vegetable', nombre: 'Sopa de verduras', macroDominante: 'carbohidrato' },
    { query: 'tofu cooked', nombre: 'Tofu cocido', macroDominante: 'proteina' },
    { query: 'egg whites', nombre: 'Claras de huevo', macroDominante: 'proteina' },
  ],
  colacion: [
    { query: 'almonds', nombre: 'Almendras', macroDominante: 'grasa' },
    { query: 'walnuts', nombre: 'Nueces', macroDominante: 'grasa' },
    { query: 'apple', nombre: 'Manzana', macroDominante: 'carbohidrato' },
    { query: 'orange', nombre: 'Naranja', macroDominante: 'carbohidrato' },
    { query: 'protein bar', nombre: 'Barra de proteína', macroDominante: 'proteina' },
    { query: 'peanut butter', nombre: 'Mantequilla de maní', macroDominante: 'grasa' },
    { query: 'hummus', nombre: 'Hummus', macroDominante: 'proteina' },
    { query: 'cheese low fat', nombre: 'Queso bajo en grasa', macroDominante: 'proteina' },
    { query: 'berries mixed', nombre: 'Frutos rojos mixtos', macroDominante: 'carbohidrato' },
    { query: 'cashews', nombre: 'Castañas de cajú', macroDominante: 'grasa' },
  ],
  grasa: [
    { query: 'olive oil', nombre: 'Aceite de oliva', macroDominante: 'grasa' },
    { query: 'avocado oil', nombre: 'Aceite de palta', macroDominante: 'grasa' },
    { query: 'coconut oil', nombre: 'Aceite de coco', macroDominante: 'grasa' },
    { query: 'seeds chia', nombre: 'Semillas de chía', macroDominante: 'grasa' },
    { query: 'seeds flax', nombre: 'Semillas de lino', macroDominante: 'grasa' },
    { query: 'seeds pumpkin', nombre: 'Semillas de calabaza', macroDominante: 'grasa' },
  ]
};

// Platos adicionales hardcodeados con datos típicos argentinos/latinos
const HARDCODED_MEALS = [
  {
    id: 'hardcoded-001',
    nombre: 'Milanesa de pollo al horno',
    macroDominante: 'proteina',
    calorias: 280,
    proteinas: 35,
    carbohidratos: 18,
    grasas: 8,
    porcionGramos: 180,
    tiemposAptos: ['almuerzo', 'cena'],
    categoria: 'Carne',
    origen: 'Argentina',
    fuente: 'manual'
  },
  {
    id: 'hardcoded-002',
    nombre: 'Ensalada mixta simple',
    macroDominante: 'carbohidrato',
    calorias: 45,
    proteinas: 2,
    carbohidratos: 8,
    grasas: 0.5,
    porcionGramos: 150,
    tiemposAptos: ['almuerzo', 'cena', 'colacion'],
    categoria: 'Ensalada',
    origen: 'Internacional',
    fuente: 'manual'
  },
  {
    id: 'hardcoded-003',
    nombre: 'Arroz blanco cocido',
    macroDominante: 'carbohidrato',
    calorias: 130,
    proteinas: 2.7,
    carbohidratos: 28,
    grasas: 0.3,
    porcionGramos: 100,
    tiemposAptos: ['almuerzo', 'cena'],
    categoria: 'Cereal',
    origen: 'Internacional',
    fuente: 'manual'
  },
  {
    id: 'hardcoded-004',
    nombre: 'Mate cocido con leche',
    macroDominante: 'carbohidrato',
    calorias: 80,
    proteinas: 4,
    carbohidratos: 12,
    grasas: 1.5,
    porcionGramos: 250,
    tiemposAptos: ['desayuno', 'media_manana', 'colacion'],
    categoria: 'Bebida',
    origen: 'Argentina',
    fuente: 'manual'
  },
  {
    id: 'hardcoded-005',
    nombre: 'Tortilla de espinaca',
    macroDominante: 'proteina',
    calorias: 180,
    proteinas: 15,
    carbohidratos: 5,
    grasas: 12,
    porcionGramos: 150,
    tiemposAptos: ['desayuno', 'almuerzo', 'cena'],
    categoria: 'Huevo',
    origen: 'Internacional',
    fuente: 'manual'
  },
  {
    id: 'hardcoded-006',
    nombre: 'Café con leche descremada',
    macroDominante: 'proteina',
    calorias: 65,
    proteinas: 6,
    carbohidratos: 9,
    grasas: 0.5,
    porcionGramos: 250,
    tiemposAptos: ['desayuno', 'media_manana', 'colacion'],
    categoria: 'Bebida',
    origen: 'Internacional',
    fuente: 'manual'
  },
  {
    id: 'hardcoded-007',
    nombre: 'Pechuga de pollo al horno con limón',
    macroDominante: 'proteina',
    calorias: 165,
    proteinas: 31,
    carbohidratos: 0,
    grasas: 3.6,
    porcionGramos: 120,
    tiemposAptos: ['almuerzo', 'cena'],
    categoria: 'Carne',
    origen: 'Internacional',
    fuente: 'manual'
  },
  {
    id: 'hardcoded-008',
    nombre: 'Medallones de merluza al horno',
    macroDominante: 'proteina',
    calorias: 140,
    proteinas: 26,
    carbohidratos: 2,
    grasas: 3,
    porcionGramos: 150,
    tiemposAptos: ['almuerzo', 'cena'],
    categoria: 'Pescado',
    origen: 'Argentina',
    fuente: 'manual'
  },
  {
    id: 'hardcoded-009',
    nombre: 'Puré de calabaza',
    macroDominante: 'carbohidrato',
    calorias: 50,
    proteinas: 1.5,
    carbohidratos: 11,
    grasas: 0.2,
    porcionGramos: 150,
    tiemposAptos: ['almuerzo', 'cena'],
    categoria: 'Verdura',
    origen: 'Internacional',
    fuente: 'manual'
  },
  {
    id: 'hardcoded-010',
    nombre: 'Tostadas integrales con queso untable light',
    macroDominante: 'carbohidrato',
    calorias: 180,
    proteinas: 8,
    carbohidratos: 28,
    grasas: 4,
    porcionGramos: 80,
    tiemposAptos: ['desayuno', 'media_manana', 'colacion'],
    categoria: 'Panificado',
    origen: 'Internacional',
    fuente: 'manual'
  }
];

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function searchUSDAFood(query) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=5&dataType=Foundation,SR%20Legacy`;
  
  console.log(`  Buscando en USDA: "${query}"...`);
  
  try {
    const data = await httpsGet(url);
    if (data.foods && data.foods.length > 0) {
      return data.foods[0]; // Retornar el primer resultado
    }
  } catch (error) {
    console.error(`  Error buscando "${query}": ${error.message}`);
  }
  
  return null;
}

function normalizeUSDAFood(usdaFood, mealConfig, tiemposAptos) {
  if (!usdaFood) return null;
  
  const nutrients = {};
  if (usdaFood.foodNutrients) {
    usdaFood.foodNutrients.forEach(nutrient => {
      const name = nutrient.nutrientName?.toLowerCase() || '';
      if (name.includes('protein')) {
        nutrients.proteinas = nutrient.value || 0;
      } else if (name.includes('carbohydrate')) {
        nutrients.carbohidratos = nutrient.value || 0;
      } else if (name.includes('total lipid') || name.includes('fat')) {
        nutrients.grasas = nutrient.value || 0;
      } else if (name.includes('energy') && !nutrients.calorias) {
        nutrients.calorias = nutrient.value || 0;
      }
    });
  }
  
  // Calcular calorías si no están disponibles
  if (!nutrients.calorias && nutrients.proteinas && nutrients.carbohidratos && nutrients.grasas) {
    nutrients.calorias = Math.round(
      (nutrients.proteinas || 0) * 4 + 
      (nutrients.carbohidratos || 0) * 4 + 
      (nutrients.grasas || 0) * 9
    );
  }
  
  // Validar que tenga datos nutricionales mínimos
  if (!nutrients.calorias || nutrients.calorias === 0) {
    return null;
  }
  
  return {
    id: `usda-${usdaFood.fdcId}`,
    nombre: mealConfig.nombre,
    nombreEn: usdaFood.description,
    macroDominante: mealConfig.macroDominante,
    calorias: Math.round(nutrients.calorias),
    proteinas: Math.round((nutrients.proteinas || 0) * 10) / 10,
    carbohidratos: Math.round((nutrients.carbohidratos || 0) * 10) / 10,
    grasas: Math.round((nutrients.grasas || 0) * 10) / 10,
    porcionGramos: 100,
    tiemposAptos,
    categoria: usdaFood.foodCategory || 'General',
    origen: 'USDA',
    fuente: 'usda'
  };
}

function mapTiemposAptos(mealType) {
  const mapping = {
    desayuno: ['desayuno', 'media_manana'],
    almuerzo: ['almuerzo'],
    cena: ['cena'],
    colacion: ['media_manana', 'colacion'],
    grasa: ['desayuno', 'media_manana', 'almuerzo', 'colacion', 'cena']
  };
  return mapping[mealType] || ['almuerzo', 'cena'];
}

async function generateMealCatalog() {
  console.log('🍽️  Generando catálogo de comidas reales...\n');
  
  // Partir del catálogo extendido hardcoded
  const allMeals = [...EXTENDED_HARDCODED_MEALS];
  console.log(`📝 Catálogo base hardcoded: ${EXTENDED_HARDCODED_MEALS.length} platos\n`);
  
  let fetchedCount = 0;
  let errorCount = 0;
  
  // Procesar solo algunos elementos de cada categoría para complementar
  const limitedSearches = {
    desayuno: MEAL_SEARCHES.desayuno.slice(0, 3),
    almuerzo: MEAL_SEARCHES.almuerzo.slice(0, 3),
    cena: MEAL_SEARCHES.cena.slice(0, 2),
    colacion: MEAL_SEARCHES.colacion.slice(0, 3),
    grasa: MEAL_SEARCHES.grasa.slice(0, 2)
  };
  
  // Procesar búsquedas limitadas desde API
  for (const [mealType, searches] of Object.entries(limitedSearches)) {
    console.log(`\n📋 Complementando categoría: ${mealType}`);
    
    for (const mealConfig of searches) {
      try {
        const usdaFood = await searchUSDAFood(mealConfig.query);
        const normalized = normalizeUSDAFood(usdaFood, mealConfig, mapTiemposAptos(mealType));
        
        if (normalized) {
          allMeals.push(normalized);
          fetchedCount++;
          console.log(`  ✅ ${normalized.nombre} (${normalized.calorias} kcal)`);
        } else {
          errorCount++;
          console.log(`  ⚠️  Sin datos para "${mealConfig.query}"`);
        }
        
        // Delay para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (error) {
        errorCount++;
        console.error(`  ❌ Error procesando "${mealConfig.query}": ${error.message}`);
      }
    }
  }
  
  // Guardar el catálogo
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allMeals, null, 2), 'utf8');
  
  console.log(`\n✅ Catálogo generado exitosamente!`);
  console.log(`   📁 Archivo: ${OUTPUT_PATH}`);
  console.log(`   📊 Total de platos: ${allMeals.length}`);
  console.log(`   🌐 Obtenidos de API: ${fetchedCount}`);
  console.log(`   📝 Hardcoded: ${EXTENDED_HARDCODED_MEALS.length}`);
  console.log(`   ⚠️  Búsquedas sin resultado: ${errorCount}`);
  
  // Estadísticas por macro dominante
  const stats = allMeals.reduce((acc, meal) => {
    acc[meal.macroDominante] = (acc[meal.macroDominante] || 0) + 1;
    return acc;
  }, {});
  
  console.log(`\n📈 Distribución por macro dominante:`);
  Object.entries(stats).forEach(([macro, count]) => {
    console.log(`   ${macro}: ${count} platos`);
  });
  
  // Estadísticas por tiempo de comida
  const timeStats = {};
  allMeals.forEach(meal => {
    meal.tiemposAptos.forEach(tiempo => {
      timeStats[tiempo] = (timeStats[tiempo] || 0) + 1;
    });
  });
  
  console.log(`\n🕐 Distribución por tiempo de comida:`);
  Object.entries(timeStats).forEach(([tiempo, count]) => {
    console.log(`   ${tiempo}: ${count} platos`);
  });
}

// Ejecutar
if (require.main === module) {
  generateMealCatalog().catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { generateMealCatalog };
