export type VersionMode = 'sin-ia' | 'con-ia';

export interface Paciente {
  id: string;
  nombre: string;
  apellido: string;
  edad: number;
  telefono: string;
  email: string;
  fechaRegistro: Date;
  activo: boolean;
  flujoActivoId?: string;
  historialFlujos?: string[];
  fechaUltimaAsignacion?: string;
  ultimoFlujoAsignadoPor?: string;
  notasUltimaAsignacion?: string;
}

export interface RegistroNutricional {
  id: string;
  pacienteId: string;
  fecha: Date;
  peso: number;
  altura: number;
  actividad: 'sedentario' | 'ligero' | 'moderado' | 'intenso';
  objetivo: 'perder' | 'mantener' | 'ganar';
  calorias: number;
  proteinas: number;
  carbohidratos: number;
  grasas: number;
  recomendaciones: string;
  observaciones?: string;
  createdWith: VersionMode;
}

export interface FlujoObjetivoFinal {
  descripcion: string;
  caloriasObjetivo: number;
  proteinasObjetivo: number;
  carbohidratosObjetivo: number;
  grasasObjetivo: number;
  menuSugerido: string[];
}

export interface SeguimientoMensual {
  id: string;
  pacienteId: string;
  mes: number;
  año: number;
  pesoInicial: number;
  pesoFinal: number;
  cumplimientoDieta: number; // 0-100%
  cumplimientoEjercicio: number; // 0-100%
  satisfaccion: number; // 1-5
  observaciones: string;
  fecha: Date;
  objetivoFinal?: FlujoObjetivoFinal;
}

export interface PautaNutricional {
  id: string;
  pacienteId: string;
  fecha: Date;
  calorias: number;
  proteinas: number;
  carbohidratos: number;
  grasas: number;
  recomendaciones: string;
  menu?: string[];
  objetivoFinal?: FlujoObjetivoFinal;
  observaciones?: string;
  createdWith: VersionMode;
  basadoEnHistorial?: boolean;
}

export interface PasoFlujo {
  id: string;
  titulo: string;
  descripcion: string;
  modulo: 'pacientes' | 'evaluacion' | 'analisis' | 'seguimiento';
  orden: number;
  modo: VersionMode | 'mixto';
  requiereIA?: boolean;
  checklist?: string[];
  accionesIA?: string[];
  estimacionMinutos?: number;
}

export interface FlujoTrabajo {
  id: string;
  nombre: string;
  descripcion: string;
  modoObjetivo: VersionMode | 'comparativo';
  pasos: PasoFlujo[];
  tiempoEstimadoMin: number;
  objetivos: string[];
  activo: boolean;
  objetivoFinal?: FlujoObjetivoFinal;
}

export interface WorkflowAccion {
  tipo: 'manual' | 'ia';
  descripcion: string;
  timestamp: string;
}

export interface WorkflowLogEntry {
  id: string;
  pacienteId: string;
  flujoId: string;
  pasoId: string;
  modo: VersionMode;
  inicio: string;
  fin?: string;
  acciones: WorkflowAccion[];
  facilidad?: number;
  comentario?: string;
  camposAutocompletados?: number;
  camposManuales?: number;
  tiempoMinutos?: number;
}

export interface PasoEjecucion {
  pasoId: string;
  logId: string;
  inicio: string;
  fin?: string;
  tiempoMinutos?: number;
  facilidad?: number;
  comentarios?: string;
  camposAutocompletados?: number;
  camposManuales?: number;
}

export interface FlujoResultado {
  tiempoTotalMin?: number;
  facilidadPromedio?: number;
  deltaPeso?: number;
  satisfaccionPaciente?: number;
  satisfaccionProfesional?: number;
  observaciones?: string;
}

export type OrdenValidacion = 'manual-primero' | 'ia-primero';

export interface FlujoAsignado {
  id: string;
  pacienteId: string;
  flujoId: string;
  modoEjecutado: VersionMode;
  fechaAsignacion: string;
  estado: 'pendiente' | 'en-progreso' | 'completado';
  pasoActualId: string | null;
  ejecucion: PasoEjecucion[];
  resultado?: FlujoResultado;
  objetivoFinal?: FlujoObjetivoFinal;
  iteracionEtiqueta?: string;
  ordenValidacion?: OrdenValidacion;
  responsableAsignacion?: string;
  notasAsignacion?: string;
}

export interface MealPortion {
  id: string;
  label: string;
  descripcion: string;
  macroDominante: 'proteina' | 'carbohidrato' | 'grasa' | 'mixto';
  calorias: number;
  proteinas: number;
  carbohidratos: number;
  grasas: number;
}

export interface MealPortionAssignment extends MealPortion {
  instanceId: string;
  units: number;
}

export interface MealTimePlan {
  id: string;
  title: string;
  portions: MealPortionAssignment[];
}

export interface DailyMealPlan {
  day: string;
  meals: MealTimePlan[];
}

export interface RealMeal {
  id: string;
  nombre: string;
  nombreEn?: string;
  descripcion?: string;
  macroDominante: 'proteina' | 'carbohidrato' | 'grasa' | 'mixto';
  calorias: number;
  proteinas: number;
  carbohidratos: number;
  grasas: number;
  porcionGramos: number;
  tiemposAptos: ('desayuno' | 'media_manana' | 'almuerzo' | 'colacion' | 'cena')[];
  categoria?: string;
  origen?: string;
  fuente?: 'usda' | 'openfoodfacts' | 'themealdb' | 'manual';
}

export interface MealSuggestion {
  mealTimeId: string;
  mealTimeName: string;
  suggestedMeals: RealMeal[];
  totalCalorias: number;
  totalProteinas: number;
  totalCarbohidratos: number;
  totalGrasas: number;
  targetCalorias: number;
  targetProteinas: number;
  targetCarbohidratos: number;
  targetGrasas: number;
}

export interface ScenarioPatientPreset {
  edad: number;
  peso: number;
  altura: number;
  actividad: 'sedentario' | 'ligero' | 'moderado' | 'intenso';
  objetivo: 'perder' | 'mantener' | 'ganar';
  masaGrasa?: number;
  masaMagra?: number;
  notas?: string;
}
