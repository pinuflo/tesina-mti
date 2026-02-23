import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { RealMeal, MealSuggestion, MealTimePlan, MealPortion } from '../models/nutricion.models';
import mealCatalog from '../data/meal-recipes.json';

@Injectable({
  providedIn: 'root'
})
export class MealCatalogService {
  private meals: RealMeal[] = mealCatalog as RealMeal[];

  constructor() {}

  /**
   * Obtiene todos los platos del catálogo
   */
  getAllMeals(): RealMeal[] {
    return this.meals;
  }

  /**
   * Filtra platos por tiempo de comida
   */
  getMealsByTime(mealTime: string): RealMeal[] {
    return this.meals.filter(meal => 
      meal.tiemposAptos.includes(mealTime as any)
    );
  }

  /**
   * Filtra platos por macro dominante
   */
  getMealsByMacro(macro: 'proteina' | 'carbohidrato' | 'grasa' | 'mixto'): RealMeal[] {
    return this.meals.filter(meal => meal.macroDominante === macro);
  }

  /**
   * Busca platos por nombre (búsqueda parcial case-insensitive)
   */
  searchMealsByName(query: string): RealMeal[] {
    const lowerQuery = query.toLowerCase();
    return this.meals.filter(meal => 
      meal.nombre.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Sugiere platos reales para un tiempo de comida basándose en las porciones asignadas
   * 
   * Algoritmo:
   * 1. Obtener los totales de macros del meal plan
   * 2. Buscar platos aptos para ese tiempo
   * 3. Intentar combinar platos que sumen macros similares (tolerancia amplia)
   * 4. Priorizar platos con macro dominante que mejor matchee
   */
  suggestMealsForTime(
    mealTimePlan: MealTimePlan,
    tolerance: number = 2.0
  ): RealMeal[] {
    const targetMacros = this.calculateTargetMacros(mealTimePlan);
    const availableMeals = this.getMealsByTime(mealTimePlan.id);

    if (targetMacros.calorias === 0 || availableMeals.length === 0) {
      return [];
    }

    // Ordenar platos por similitud con los targets
    const scored = availableMeals.map(meal => {
      const score = this.calculateSimilarityScore(meal, targetMacros, tolerance);
      return { meal, score };
    });

    // Ordenar por score descendente y tomar los mejores 3
    // (no filtrar por score > 0 para asegurar que siempre haya sugerencias si hay platos disponibles)
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.meal);
  }

  /**
   * Sugiere un menú completo para el día basado en el meal plan
   */
  suggestFullMenu(meals: MealTimePlan[]): MealSuggestion[] {
    return meals.map(meal => {
      const targetMacros = this.calculateTargetMacros(meal);
      const suggestedMeals = this.suggestMealsForTime(meal);

      return {
        mealTimeId: meal.id,
        mealTimeName: meal.title,
        suggestedMeals,
        totalCalorias: suggestedMeals.reduce((sum, m) => sum + m.calorias, 0),
        totalProteinas: suggestedMeals.reduce((sum, m) => sum + m.proteinas, 0),
        totalCarbohidratos: suggestedMeals.reduce((sum, m) => sum + m.carbohidratos, 0),
        totalGrasas: suggestedMeals.reduce((sum, m) => sum + m.grasas, 0),
        targetCalorias: targetMacros.calorias,
        targetProteinas: targetMacros.proteinas,
        targetCarbohidratos: targetMacros.carbohidratos,
        targetGrasas: targetMacros.grasas
      };
    });
  }

  /**
   * Calcula los macros objetivo de un MealTimePlan sumando sus porciones
   */
  private calculateTargetMacros(mealTimePlan: MealTimePlan): {
    calorias: number;
    proteinas: number;
    carbohidratos: number;
    grasas: number;
  } {
    return mealTimePlan.portions.reduce(
      (acc, portion) => ({
        calorias: acc.calorias + portion.calorias * portion.units,
        proteinas: acc.proteinas + portion.proteinas * portion.units,
        carbohidratos: acc.carbohidratos + portion.carbohidratos * portion.units,
        grasas: acc.grasas + portion.grasas * portion.units
      }),
      { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 }
    );
  }

  /**
   * Calcula un score de similitud entre un plato real y los macros objetivo
   * 
   * Score más alto = mejor match
   * Score 0 = fuera de tolerancia
   * 
   * Factores:
   * - Diferencia % en calorías (peso: 40%)
   * - Diferencia % en proteínas (peso: 20%)
   * - Diferencia % en carbohidratos (peso: 20%)
   * - Diferencia % en grasas (peso: 20%)
   */
  private calculateSimilarityScore(
    meal: RealMeal,
    target: { calorias: number; proteinas: number; carbohidratos: number; grasas: number },
    tolerance: number
  ): number {
    // Si el target es 0, no hay match posible
    if (target.calorias === 0) {
      return 0;
    }

    // Calcular diferencias relativas
    const calDiff = Math.abs(meal.calorias - target.calorias) / target.calorias;
    const protDiff = target.proteinas > 0 ? Math.abs(meal.proteinas - target.proteinas) / target.proteinas : 0;
    const carbDiff = target.carbohidratos > 0 ? Math.abs(meal.carbohidratos - target.carbohidratos) / target.carbohidratos : 0;
    const fatDiff = target.grasas > 0 ? Math.abs(meal.grasas - target.grasas) / target.grasas : 0;

    // Score inverso: menos diferencia = más score
    // Normalizar a escala 0-100
    const calScore = Math.max(0, 100 * (1 - calDiff / tolerance));
    const protScore = Math.max(0, 100 * (1 - protDiff / tolerance));
    const carbScore = Math.max(0, 100 * (1 - carbDiff / tolerance));
    const fatScore = Math.max(0, 100 * (1 - fatDiff / tolerance));

    // Ponderación
    const totalScore = (calScore * 0.4) + (protScore * 0.2) + (carbScore * 0.2) + (fatScore * 0.2);

    return Math.max(0, totalScore);
  }

  /**
   * Obtiene estadísticas del catálogo
   */
  getCatalogStats(): {
    totalMeals: number;
    byMacro: Record<string, number>;
    byTime: Record<string, number>;
    byOrigin: Record<string, number>;
  } {
    const stats = {
      totalMeals: this.meals.length,
      byMacro: {} as Record<string, number>,
      byTime: {} as Record<string, number>,
      byOrigin: {} as Record<string, number>
    };

    this.meals.forEach(meal => {
      // Por macro
      stats.byMacro[meal.macroDominante] = (stats.byMacro[meal.macroDominante] || 0) + 1;

      // Por tiempo
      meal.tiemposAptos.forEach(tiempo => {
        stats.byTime[tiempo] = (stats.byTime[tiempo] || 0) + 1;
      });

      // Por origen
      const origen = meal.origen || 'Desconocido';
      stats.byOrigin[origen] = (stats.byOrigin[origen] || 0) + 1;
    });

    return stats;
  }
}
