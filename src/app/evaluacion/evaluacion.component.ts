import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { VersionService } from '../services/version.service';
import { DataService } from '../services/data.service';
import {
  Paciente,
  FlujoAsignado,
  FlujoTrabajo,
  PasoFlujo,
  DailyMealPlan,
  MealPortion,
  MealPortionAssignment,
  ScenarioPatientPreset,
  MealSuggestion,
  RealMeal
} from '../models/nutricion.models';
import { ScenarioService } from '../services/scenario.service';
import { WorkflowService } from '../services/workflow.service';
import { MealCatalogService } from '../services/meal-catalog.service';
import { MacroTagComponent } from '../components/macro-tag/macro-tag.component';

@Component({
  selector: 'app-evaluacion',
  standalone: true,
  imports: [CommonModule, FormsModule, MacroTagComponent],
  templateUrl: './evaluacion.component.html',
  styleUrl: './evaluacion.component.scss'
})
export class EvaluacionComponent implements OnInit {
  private readonly allMealOrder = ['desayuno', 'media_manana', 'almuerzo', 'colacion', 'cena'] as const;
  private readonly threeMealOrder = ['desayuno', 'almuerzo', 'cena'] as const;
  // Expone Math para poder usar Math.abs desde la plantilla
  readonly Math = Math;
  isAIEnabled = false;
  pacienteSeleccionado: Paciente | null = null;
  pacientes: Paciente[] = [];
  currentStep: 1 | 2 = 1;
  scenarioPreset: ScenarioPatientPreset | null = null;
  scenarioPatientName: string | null = null;
  requiredMealTimes: 3 | 5 = 5;
  
  // Datos del paciente
  paciente = {
    id: '',
    nombre: '',
    edad: '',
    peso: '',
    altura: '',
    actividad: 'sedentario',
    objetivo: 'mantener',
    masaGrasa: '',
    masaMagra: ''
  };

  // Pauta nutricional
  pautaNutricional = {
    calorias: 0,
    proteinas: 0,
    carbohidratos: 0,
    grasas: 0,
    recomendaciones: ''
  };

  availablePortions: MealPortion[] = [
    {
      id: 'macro-proteina',
      label: 'Porción de proteína',
      descripcion: '25g proteína neta',
      macroDominante: 'proteina',
      calorias: 130,
      proteinas: 25,
      carbohidratos: 0,
      grasas: 3
    },
    {
      id: 'macro-carbo',
      label: 'Porción de carbohidratos',
      descripcion: '30g carbohidratos + 2g grasa',
      macroDominante: 'carbohidrato',
      calorias: 150,
      proteinas: 2,
      carbohidratos: 30,
      grasas: 2
    },
    {
      id: 'macro-grasa',
      label: 'Porción de grasa',
      descripcion: '15g grasas mono/poli',
      macroDominante: 'grasa',
      calorias: 135,
      proteinas: 0,
      carbohidratos: 0,
      grasas: 15
    }
  ];

  portionGrams: Record<string, number> = {};
  useStandardPortions = true;
  private defaultPortionGrams: Record<string, number> = {};

  macroOrder: MealPortion['macroDominante'][] = ['proteina', 'carbohidrato', 'grasa'];
  private macroPortionMap: Record<MealPortion['macroDominante'], string> = {
    proteina: 'macro-proteina',
    carbohidrato: 'macro-carbo',
    grasa: 'macro-grasa',
    mixto: 'macro-carbo'
  };
  private macroGramRanges: Record<'proteina' | 'carbohidrato' | 'grasa', { min: number; max: number }> = {
    proteina: { min: 15, max: 40 },
    carbohidrato: { min: 15, max: 60 },
    grasa: { min: 5, max: 25 }
  };
  macroQuickPresets = [0, 1, 2, 3];
  private mealMacroDistribution: Record<string, { proteina: number; carbohidrato: number; grasa: number }> = {
    desayuno: { proteina: 0.25, carbohidrato: 0.3, grasa: 0.2 },
    media_manana: { proteina: 0.15, carbohidrato: 0.15, grasa: 0.1 },
    almuerzo: { proteina: 0.3, carbohidrato: 0.3, grasa: 0.3 },
    colacion: { proteina: 0.1, carbohidrato: 0.1, grasa: 0.15 },
    cena: { proteina: 0.2, carbohidrato: 0.15, grasa: 0.25 }
  };

  dailyMealPlan: DailyMealPlan = this.buildEmptyDailyPlan();
  private macroTolerance = 0.08;
  private fatTolerance = 0.1;

  mealSuggestions: MealSuggestion[] = [];
  showMealSuggestions = false;
  showIADistributionWizard = false;
  iaHelpFlowStep: 1 | 2 = 1;
  iaHelpBaseApplied = false;
  iaHelpFlowCompleted = false;
  iaDistributionWizard = {
    mealsPerDay: 5,
    priority: 'equilibrado' as 'equilibrado' | 'proteina' | 'carbohidrato' | 'grasa',
    carbTiming: 'equilibrado' as 'equilibrado' | 'temprano' | 'tarde',
    lightDinner: false,
    includeSnacks: true
  };

  flujoAsignado: FlujoAsignado | null = null;
  flujoDetalle: FlujoTrabajo | null = null;
  pasosFlujo: PasoFlujo[] = [];
  pasoEnEjecucion: PasoFlujo | null = null;
  feedbackPaso = {
    facilidad: 3,
    camposAutocompletados: 0,
    camposManuales: 6,
    comentarios: ''
  };
  metricasPasoRuntime = {
    interacciones: 0,
    iaSugerencias: 0,
    iaAceptadas: 0,
    iaCorregidas: 0
  };
  private pasoMetricasActualId: string | null = null;
  private camposEditadosPaso = new Set<string>();
  private camposSugeridosIA = new Set<string>();
  private camposAceptadosIA = new Set<string>();
  private camposCorregidosIA = new Set<string>();

  estimacionMasaGrasa = 0;
  estimacionMasaMagra = 0;
  porcentajeGrasaEstimado = 0;

  constructor(
    private versionService: VersionService,
    public dataService: DataService,
    private route: ActivatedRoute,
    private router: Router,
    private scenarioService: ScenarioService,
    private workflowService: WorkflowService,
    private mealCatalogService: MealCatalogService
  ) {}

  ngOnInit(): void {
    this.versionService.version$.subscribe(() => {
      this.syncAIMode();
    });

    this.dataService.pacientes$.subscribe(pacientes => {
      this.pacientes = pacientes.filter(p => p.activo);
    });

    this.route.queryParams.subscribe(params => {
      const pacienteId = params['pacienteId'];
      if (pacienteId) {
        const paciente = this.dataService.getPacienteById(pacienteId);
        if (paciente) {
          this.seleccionarPaciente(paciente);
        }
      }
    });

    this.initPortionGrams();
  }

  seleccionarPaciente(paciente: Paciente | null) {
    if (!paciente) {
      return;
    }

    this.pacienteSeleccionado = paciente;
    this.currentStep = 1;
    this.paciente = {
      ...this.paciente,
      id: paciente.id,
      nombre: `${paciente.nombre} ${paciente.apellido}`.trim(),
      edad: paciente.edad ? paciente.edad.toString() : '',
      peso: '',
      altura: '',
      actividad: 'sedentario',
      objetivo: 'mantener',
      masaGrasa: '',
      masaMagra: ''
    };

    const ultimoRegistro = this.dataService.getRegistrosByPaciente(paciente.id)[0];
    if (ultimoRegistro) {
      this.paciente.peso = ultimoRegistro.peso.toString();
      this.paciente.altura = ultimoRegistro.altura.toString();
      this.paciente.actividad = ultimoRegistro.actividad;
      this.paciente.objetivo = ultimoRegistro.objetivo;
    }

    this.pautaNutricional = {
      calorias: 0,
      proteinas: 0,
      carbohidratos: 0,
      grasas: 0,
      recomendaciones: ''
    };
    this.showMealSuggestions = false;
    this.showIADistributionWizard = false;
    this.iaHelpFlowStep = 1;
    this.iaHelpBaseApplied = false;
    this.iaHelpFlowCompleted = false;
    this.resetMealPlan();
    this.syncScenarioMealConstraint();

    this.calcularEstimacionComposicion(paciente.id);
    this.actualizarFlujoParaPaciente(paciente.id);
  }

  calcularMacrosDiarios() {
    this.registrarInteraccion();
    if (!this.pacienteSeleccionado) {
      alert('Selecciona un paciente antes de calcular.');
      return;
    }
    const edad = this.obtenerEdadReferencia();
    const peso = parseFloat(this.paciente.peso);
    const altura = parseFloat(this.paciente.altura);

    if (!edad || edad <= 0 || !peso || peso <= 0 || !altura || altura <= 0) {
      alert('Por favor completa edad, peso y altura válidos para continuar.');
      return;
    }

    this.currentStep = 1;
    
    // Fórmula de Harris-Benedict (aproximada)
    let tmb = 88.362 + (13.397 * peso) + (4.799 * altura) - (5.677 * edad);
    
    // Factor de actividad
    const factorActividad = {
      'sedentario': 1.2,
      'ligero': 1.375,
      'moderado': 1.55,
      'intenso': 1.725
    };
    
    let calorias = tmb * factorActividad[this.paciente.actividad as keyof typeof factorActividad];
    
    // Ajustar según objetivo
    if (this.paciente.objetivo === 'perder') {
      calorias -= 500;
    } else if (this.paciente.objetivo === 'ganar') {
      calorias += 500;
    }
    
    const masaMagra = parseFloat(this.paciente.masaMagra || '0');
    const masaGrasa = parseFloat(this.paciente.masaGrasa || '0');
    const proteinaBase = masaMagra > 0 ? masaMagra : Math.max(0, peso - masaGrasa);
    const proteinasPorKg = this.paciente.objetivo === 'ganar' ? 1.8 : this.paciente.objetivo === 'perder' ? 1.6 : 1.4;
    const proteinasDia = Math.max(0, Math.round(proteinaBase * proteinasPorKg));
    const caloriasRestantes = Math.max(0, calorias - proteinasDia * 4);
    const grasasDia = Math.round((caloriasRestantes * 0.35) / 9);
    const carbohidratosDia = Math.max(0, Math.round((calorias - proteinasDia * 4 - grasasDia * 9) / 4));

    this.pautaNutricional = {
      calorias: Math.round(calorias),
      proteinas: proteinasDia,
      carbohidratos: carbohidratosDia,
      grasas: grasasDia,
      recomendaciones: this.isAIEnabled ? this.generarRecomendacionesIA() : this.generarRecomendacionesBasicas()
    };

    this.resetMealPlan();

    if (this.pasoEnEjecucion && this.pasoEnEjecucion.modulo === 'evaluacion' && this.currentStep === 1) {
      this.completarPaso(this.pasoEnEjecucion);
    }
  }

  guardarPauta() {
    this.registrarInteraccion();
    if (this.currentStep !== 2) {
      alert('Debes completar el subpaso de cierre de pauta antes de guardar.');
      return;
    }
    if (this.pautaNutricional.calorias === 0 || !this.pacienteSeleccionado) {
      alert('Primero debe calcular la pauta nutricional');
      return;
    }

    if (!this.planTienePorciones()) {
      alert('Arma al menos un día de pauta semanal arrastrando porciones o usa "Sugerir pauta"');
      return;
    }

    const mealTimeError = this.getMealTimeRequirementError();
    if (mealTimeError) {
      alert(mealTimeError);
      return;
    }

    const pasoMenuReal = this.getPasoMenuRealId();
    if (pasoMenuReal && !this.estaPasoCompletado(pasoMenuReal)) {
      alert('Antes de guardar la pauta debes ejecutar "Sugerir menú real" para completar la fase de medición.');
      return;
    }

    // Guardar registro nutricional
    this.dataService.addRegistro({
      pacienteId: this.pacienteSeleccionado.id,
      fecha: new Date(),
      peso: parseFloat(this.paciente.peso),
      altura: parseFloat(this.paciente.altura),
      actividad: this.paciente.actividad as any,
      objetivo: this.paciente.objetivo as any,
      calorias: this.pautaNutricional.calorias,
      proteinas: this.pautaNutricional.proteinas,
      carbohidratos: this.pautaNutricional.carbohidratos,
      grasas: this.pautaNutricional.grasas,
      recomendaciones: this.pautaNutricional.recomendaciones,
      createdWith: this.isAIEnabled ? 'con-ia' : 'sin-ia'
    });

    // Guardar pauta nutricional
    const menuSugerido = this.buildMenuFromPlan();
    this.dataService.addPauta({
      pacienteId: this.pacienteSeleccionado.id,
      fecha: new Date(),
      calorias: this.pautaNutricional.calorias,
      proteinas: this.pautaNutricional.proteinas,
      carbohidratos: this.pautaNutricional.carbohidratos,
      grasas: this.pautaNutricional.grasas,
      recomendaciones: this.pautaNutricional.recomendaciones,
      menu: menuSugerido,
      createdWith: this.isAIEnabled ? 'con-ia' : 'sin-ia',
      basadoEnHistorial: this.dataService.getRegistrosByPaciente(this.pacienteSeleccionado.id).length > 0
    });

    alert('✅ Pauta nutricional guardada exitosamente');

    const pasoCierre = this.getPasoCierrePautaId();
    if (pasoCierre) {
      this.completarPasoPorId(pasoCierre, 'Pauta guardada y cierre final completado.');
    } else if (this.pasoEnEjecucion && this.pasoEnEjecucion.modulo === 'evaluacion') {
      this.completarPaso(this.pasoEnEjecucion);
    }

    this.actualizarFlujoParaPaciente(this.pacienteSeleccionado.id);
    this.scenarioService.syncWithWorkflowNow();
    
    // Navegar al seguimiento del paciente
    this.router.navigate(['/seguimiento'], { 
      queryParams: { pacienteId: this.pacienteSeleccionado.id } 
    });
  }

  continuarPaso2() {
    this.registrarInteraccion();
    if (!this.validarPacienteCompleto()) {
      return;
    }
    if (!this.ensureScenarioPreset()) {
      return;
    }
    if (!this.validarDatosContraEscenario()) {
      return;
    }

    if (!this.pautaNutricional.calorias) {
      this.calcularMacrosDiarios();
      if (!this.pautaNutricional.calorias) {
        return;
      }
    }

    if (this.pasoEnEjecucion && this.pasoEnEjecucion.modulo === 'evaluacion') {
      if (!this.estaPasoCompletado(this.pasoEnEjecucion.id)) {
        this.completarPaso(this.pasoEnEjecucion);
      }
      const pacienteId = this.flujoAsignado?.pacienteId || this.pacienteSeleccionado?.id;
      if (pacienteId) {
        this.actualizarFlujoParaPaciente(pacienteId);
      }
    }

    this.currentStep = 2;
    if (this.isAIEnabled) {
      this.abrirAsistenteDistribucionIA(true);
    }
  }

  volverPaso1() {
    this.currentStep = 1;
    this.showMealSuggestions = false;
    this.showIADistributionWizard = false;
    this.iaHelpFlowStep = 1;
    this.iaHelpBaseApplied = false;
    this.iaHelpFlowCompleted = false;
  }

  getMealTotals(mealId: string) {
    const meal = this.dailyMealPlan.meals.find(m => m.id === mealId);
    if (!meal) {
      return { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 };
    }
    return meal.portions.reduce(
      (acc, portion) => ({
        calorias: acc.calorias + portion.calorias * portion.units,
        proteinas: acc.proteinas + portion.proteinas * portion.units,
        carbohidratos: acc.carbohidratos + portion.carbohidratos * portion.units,
        grasas: acc.grasas + portion.grasas * portion.units
      }),
      { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 }
    );
  }

  getMealMacroSummary(mealId: string) {
    const meal = this.dailyMealPlan.meals.find(m => m.id === mealId);
    if (!meal) {
      return [] as Array<{
        macro: MealPortion['macroDominante'];
        count: number;
        proteinas: number;
        carbohidratos: number;
        grasas: number;
        calorias: number;
      }>;
    }

    const summary: Record<MealPortion['macroDominante'], {
      count: number;
      proteinas: number;
      carbohidratos: number;
      grasas: number;
      calorias: number;
    }> = {} as any;

    meal.portions.forEach(portion => {
      const macro = portion.macroDominante;
      if (!summary[macro]) {
        summary[macro] = { count: 0, proteinas: 0, carbohidratos: 0, grasas: 0, calorias: 0 };
      }
      summary[macro].count += portion.units;
      summary[macro].proteinas += portion.proteinas * portion.units;
      summary[macro].carbohidratos += portion.carbohidratos * portion.units;
      summary[macro].grasas += portion.grasas * portion.units;
      summary[macro].calorias += portion.calorias * portion.units;
    });

    return this.macroOrder
      .filter(macro => summary[macro] && summary[macro].count > 0)
      .map(macro => ({ macro, ...summary[macro] }));
  }

  getMacroUnitsForMeal(mealId: string, macro: MealPortion['macroDominante']): number {
    const meal = this.dailyMealPlan.meals.find(m => m.id === mealId);
    if (!meal) {
      return 0;
    }
    return meal.portions
      .filter(portion => portion.macroDominante === macro)
      .reduce((sum, portion) => sum + (portion.units || 1), 0);
  }

  onMealMacroSliderChange(mealId: string, macro: MealPortion['macroDominante'], rawValue: number | string) {
    this.registrarEdicionCampo(`macro-${mealId}-${macro}`);
    this.setMacroUnitsForMeal(mealId, macro, Number(rawValue));
  }

  applyMacroPreset(mealId: string, macro: MealPortion['macroDominante'], presetUnits: number) {
    this.registrarEdicionCampo(`macro-${mealId}-${macro}`);
    this.setMacroUnitsForMeal(mealId, macro, presetUnits);
  }

  getMacroUnitGrams(macro: MealPortion['macroDominante']): number {
    const base = this.getBasePortionForMacro(macro);
    return base ? this.getDominantGramsValue(base) : 0;
  }

  getMacroUnitCalories(macro: MealPortion['macroDominante']): number {
    const base = this.getBasePortionForMacro(macro);
    return base ? base.calorias : 0;
  }

  getMacroTotalsForMeal(mealId: string, macro: MealPortion['macroDominante']) {
    const units = this.getMacroUnitsForMeal(mealId, macro);
    const grams = units * this.getMacroUnitGrams(macro);
    const calorias = units * this.getMacroUnitCalories(macro);
    return { units, grams, calorias };
  }

  private setMacroUnitsForMeal(mealId: string, macro: MealPortion['macroDominante'], units: number) {
    const meal = this.dailyMealPlan.meals.find(m => m.id === mealId);
    if (!meal) {
      return;
    }

    const targetUnits = this.clampMacroUnits(units);
    const currentUnits = this.getMacroUnitsForMeal(mealId, macro);
    if (targetUnits === currentUnits) {
      return;
    }

    meal.portions = meal.portions.filter(portion => portion.macroDominante !== macro);
    const basePortionId = this.macroPortionMap[macro];
    if (!basePortionId) {
      return;
    }

    for (let i = 0; i < targetUnits; i++) {
      this.agregarPorcionAMeal(basePortionId, mealId);
    }
  }

  private getBasePortionForMacro(macro: MealPortion['macroDominante']): MealPortion | undefined {
    const portionId = this.macroPortionMap[macro];
    return this.availablePortions.find(portion => portion.id === portionId);
  }

  private clampMacroUnits(value: number | string): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.max(0, Math.min(6, Math.round(numeric)));
  }

  onPortionGramsChange(portion: MealPortion, gramsValue: number) {
    if (this.useStandardPortions) {
      return;
    }
    this.registrarEdicionCampo(`porcion-${portion.id}`);
    const range = this.getPortionRange(portion);
    const grams = this.clampGrams(Number(gramsValue), range.min, range.max);
    this.portionGrams[portion.id] = grams;
    this.applyDominantGrams(portion, grams);
  }

  toggleCustomPortions() {
    this.registrarInteraccion();
    this.useStandardPortions = !this.useStandardPortions;
    if (this.useStandardPortions) {
      this.restablecerPorcionesEstandar();
    }
  }

  restablecerPorcionesEstandar() {
    this.availablePortions.forEach(portion => {
      const standard = this.defaultPortionGrams[portion.id] ?? this.getDominantGramsValue(portion);
      this.portionGrams[portion.id] = standard;
      this.applyDominantGrams(portion, standard);
    });
  }

  getPortionRange(portion: MealPortion): { min: number; max: number } {
    if (portion.macroDominante === 'proteina' || portion.macroDominante === 'carbohidrato' || portion.macroDominante === 'grasa') {
      return this.macroGramRanges[portion.macroDominante];
    }
    return { min: 0, max: 100 };
  }

  isPortionCustomized(portion: MealPortion): boolean {
    const standard = this.defaultPortionGrams[portion.id];
    const current = this.portionGrams[portion.id];
    if (typeof standard !== 'number' || typeof current !== 'number') {
      return false;
    }
    return current !== standard;
  }

  getMacroLabel(macro: MealPortion['macroDominante']): string {
    switch (macro) {
      case 'proteina':
        return 'proteína';
      case 'carbohidrato':
        return 'carbohidrato';
      case 'grasa':
        return 'grasa';
      default:
        return 'mixto';
    }
  }

  mapMacroResumenToDominante(macro: string): 'proteina' | 'carbohidrato' | 'grasa' {
    if (macro === 'proteinas') {
      return 'proteina';
    }
    if (macro === 'carbohidratos') {
      return 'carbohidrato';
    }
    return 'grasa';
  }

  getDominantGramsDisplay(portion: MealPortion): number {
    return this.getDominantGramsValue(portion);
  }

  getDailyTotals() {
    return this.getVisibleMeals().reduce(
      (acc, meal) => {
        meal.portions.forEach(portion => {
          acc.calorias += portion.calorias * portion.units;
          acc.proteinas += portion.proteinas * portion.units;
          acc.carbohidratos += portion.carbohidratos * portion.units;
          acc.grasas += portion.grasas * portion.units;
        });
        return acc;
      },
      { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 }
    );
  }

  getMacroProgress(macro: 'proteinas' | 'carbohidratos' | 'grasas') {
    const totals = this.getDailyTotals();
    const target = (this.pautaNutricional as any)[macro] || 0;
    const current = (totals as any)[macro] || 0;
    const delta = target - current;
    const pct = target > 0 ? Math.min(130, Math.round((current / target) * 100)) : 0;
    return { current, target, delta, pct };
  }

  isCaloriesOnTarget(): boolean {
    const progress = this.getCaloriesProgress();
    if (!progress.target) {
      return false;
    }
    return Math.abs(progress.delta) <= progress.target * 0.05;
  }

  isMacroOnTarget(macro: 'proteinas' | 'carbohidratos' | 'grasas'): boolean {
    const progress = this.getMacroProgress(macro);
    if (!progress.target) {
      return false;
    }
    return Math.abs(progress.delta) <= this.getMacroAllowedDelta(macro, progress.target);
  }

  planCumpleMacros(): boolean {
    if (!this.pautaNutricional.calorias) {
      return false;
    }
    const totals = this.getDailyTotals();
    const dentroProte = Math.abs(this.pautaNutricional.proteinas - totals.proteinas) <= this.getMacroAllowedDelta('proteinas', this.pautaNutricional.proteinas);
    const dentroCarb = Math.abs(this.pautaNutricional.carbohidratos - totals.carbohidratos) <= this.getMacroAllowedDelta('carbohidratos', this.pautaNutricional.carbohidratos);
    const dentroGrasa = Math.abs(this.pautaNutricional.grasas - totals.grasas) <= this.getMacroAllowedDelta('grasas', this.pautaNutricional.grasas);
    return dentroProte && dentroCarb && dentroGrasa;
  }

  getMacroToleranceSummary(): string {
    return 'Proteina: +/-8% (min 5g) · Carbohidrato: +/-8% (min 10g) · Grasa: +/-10% (min 8g)';
  }

  private getMacroAllowedDelta(macro: 'proteinas' | 'carbohidratos' | 'grasas', target: number): number {
    if (macro === 'proteinas') {
      return Math.max(5, target * this.macroTolerance);
    }
    if (macro === 'carbohidratos') {
      return Math.max(10, target * this.macroTolerance);
    }
    return Math.max(8, target * this.fatTolerance);
  }

  resetMealPlan() {
    this.dailyMealPlan = this.buildEmptyDailyPlan();
  }

  sugerirPautaIA() {
    this.registrarInteraccion();
    if (!this.isAIEnabled) {
      return;
    }
    if (!this.pautaNutricional.calorias) {
      alert('Primero calcula los macros diarios.');
      return;
    }

    this.resetMealPlan();
    const recetaIA: Record<string, { portionId: string; units?: number }[]> = {
      desayuno: [
        { portionId: 'macro-proteina' },
        { portionId: 'macro-carbo' }
      ],
      media_manana: [
        { portionId: 'macro-proteina' },
        { portionId: 'macro-carbo' }
      ],
      almuerzo: [
        { portionId: 'macro-proteina', units: 2 },
        { portionId: 'macro-carbo', units: 2 },
        { portionId: 'macro-grasa' }
      ],
      colacion: [
        { portionId: 'macro-proteina' },
        { portionId: 'macro-grasa' }
      ],
      cena: [
        { portionId: 'macro-proteina' },
        { portionId: 'macro-carbo' },
        { portionId: 'macro-grasa' }
      ]
    };

    Object.entries(recetaIA).forEach(([mealId, combos]) => {
      combos.forEach(combo => {
        const reps = combo.units ?? 1;
        for (let i = 0; i < reps; i++) {
          this.agregarPorcionAMeal(combo.portionId, mealId);
        }
      });
    });
  }

  distribuirMacrosIA() {
    this.registrarInteraccion();
    if (!this.isAIEnabled) {
      return;
    }
    if (!this.pautaNutricional.calorias) {
      alert('Calcula los macros diarios antes de distribuirlos.');
      return;
    }

    this.distribuirMacrosConPesos();
  }

  abrirAsistenteDistribucionIA(autoOpen = false) {
    if (!this.isAIEnabled) {
      return;
    }
    if (this.currentStep !== 2) {
      return;
    }
    if (!this.pautaNutricional.calorias) {
      alert('Primero calcula los macros diarios antes de usar el asistente IA.');
      return;
    }
    if (!autoOpen) {
      this.registrarInteraccion();
    }
    this.registrarSugerenciaIA('flujoAyudaIA');
    this.iaHelpFlowStep = 1;
    this.iaHelpBaseApplied = false;
    this.iaHelpFlowCompleted = false;
    this.showIADistributionWizard = true;
  }

  aplicarDistribucionBaseIA() {
    if (!this.isAIEnabled || !this.pautaNutricional.calorias) {
      return;
    }
    this.registrarInteraccion();
    this.distribuirMacrosConPesos();
    this.registrarAceptacionIA('distribucionBaseIA');
    this.iaHelpBaseApplied = true;
    this.iaHelpFlowStep = 2;
  }

  avanzarPasoAsistenteIA() {
    this.iaHelpFlowStep = 2;
  }

  volverPasoAsistenteIA() {
    this.iaHelpFlowStep = 1;
  }

  cerrarAsistenteDistribucionIA() {
    this.showIADistributionWizard = false;
  }

  aplicarAsistenteDistribucionIA() {
    if (!this.isAIEnabled || !this.pautaNutricional.calorias) {
      return;
    }
    if (!this.iaHelpBaseApplied) {
      alert('Primero debes completar el paso 1 de ayuda IA (distribución base).');
      this.iaHelpFlowStep = 1;
      return;
    }
    this.registrarInteraccion();
    const profile = this.buildWizardDistributionProfile();
    this.distribuirMacrosConPesos(profile);
    this.registrarAceptacionIA('wizardDistribucion');
    this.iaHelpFlowCompleted = true;
    this.showIADistributionWizard = false;
  }

  private distribuirMacrosConPesos(
    profile?: Record<string, { proteina: number; carbohidrato: number; grasa: number }>
  ) {

    this.resetMealPlan();

    const macroTargets: Record<'proteina' | 'carbohidrato' | 'grasa', number> = {
      proteina: this.pautaNutricional.proteinas,
      carbohidrato: this.pautaNutricional.carbohidratos,
      grasa: this.pautaNutricional.grasas
    };

    (['proteina', 'carbohidrato', 'grasa'] as const).forEach(macro => {
      const basePortionId = this.macroPortionMap[macro];
      const portionTemplate = this.availablePortions.find(p => p.id === basePortionId);
      const gramsPerPortion = portionTemplate ? this.getDominantGramsValue(portionTemplate) : 0;
      if (!portionTemplate || gramsPerPortion === 0) {
        return;
      }

      const totalPortionsNeeded = Math.max(0, Math.round(macroTargets[macro] / gramsPerPortion));
      if (totalPortionsNeeded === 0) {
        return;
      }

      const weightMap = this.buildMacroWeightMap(macro, profile);
      const distribution = this.distributePortionsAcrossMeals(totalPortionsNeeded, weightMap);

      Object.entries(distribution).forEach(([mealId, count]) => {
        for (let i = 0; i < count; i++) {
          this.agregarPorcionAMeal(basePortionId, mealId);
        }
      });
    });
  }

  sugerirMenuReal() {
    this.registrarInteraccion();
    if (this.isAIEnabled && !this.iaHelpFlowCompleted) {
      alert('En modo IA, primero completa los 2 pasos del flujo de ayuda IA.');
      this.abrirAsistenteDistribucionIA();
      return;
    }
    if (!this.planTienePorciones()) {
      alert('Primero arma el plan de macros arrastrando porciones o ejecutando la ayuda IA.');
      return;
    }

    const mealTimeError = this.getMealTimeRequirementError();
    if (mealTimeError) {
      alert(mealTimeError);
      return;
    }

    console.log('Plan de comidas:', this.dailyMealPlan.meals);
    this.mealSuggestions = this.mealCatalogService.suggestFullMenu(this.dailyMealPlan.meals);
    console.log('Sugerencias generadas:', this.mealSuggestions);
    this.showMealSuggestions = true;

    const pasoMenuReal = this.getPasoMenuRealId();
    if (pasoMenuReal) {
      this.completarPasoPorId(pasoMenuReal, 'Sugerencia de menú real generada para la pauta.');
    }
  }

  toggleMealSuggestions() {
    if (this.currentStep !== 2) {
      return;
    }
    this.showMealSuggestions = !this.showMealSuggestions;
  }

  closeMealSuggestions() {
    this.showMealSuggestions = false;
  }

  private buildMacroWeightMap(
    macro: 'proteina' | 'carbohidrato' | 'grasa',
    profile?: Record<string, { proteina: number; carbohidrato: number; grasa: number }>
  ): Record<string, number> {
    const map: Record<string, number> = {};
    const baseProfile = profile || this.mealMacroDistribution;
    this.getVisibleMeals().forEach(meal => {
      const preset = baseProfile[meal.id];
      map[meal.id] = preset ? preset[macro] : 0;
    });
    const totalWeight = Object.values(map).reduce((sum, value) => sum + value, 0);
    const visibleMeals = this.getVisibleMeals();
    if (totalWeight === 0 && visibleMeals.length) {
      const equalShare = 1 / visibleMeals.length;
      visibleMeals.forEach(meal => {
        map[meal.id] = equalShare;
      });
    }
    return map;
  }

  private distributePortionsAcrossMeals(totalPortions: number, weights: Record<string, number>): Record<string, number> {
    const result: Record<string, number> = {};
    const entries = Object.entries(weights);
    if (!entries.length || totalPortions <= 0) {
      return result;
    }

    let assigned = 0;
    entries.forEach(([mealId, weight]) => {
      const portionCount = weight > 0 ? Math.floor(totalPortions * weight) : 0;
      result[mealId] = portionCount;
      assigned += portionCount;
    });

    let remaining = totalPortions - assigned;
    const sorted = [...entries].sort((a, b) => b[1] - a[1]);
    let index = 0;
    while (remaining > 0 && sorted.length) {
      const mealId = sorted[index % sorted.length][0];
      result[mealId] = (result[mealId] || 0) + 1;
      remaining -= 1;
      index += 1;
    }

    return result;
  }

  private buildWizardDistributionProfile(): Record<string, { proteina: number; carbohidrato: number; grasa: number }> {
    const base: Record<string, { proteina: number; carbohidrato: number; grasa: number }> = {
      desayuno: { proteina: 0.25, carbohidrato: 0.3, grasa: 0.2 },
      media_manana: { proteina: 0.15, carbohidrato: 0.15, grasa: 0.1 },
      almuerzo: { proteina: 0.3, carbohidrato: 0.3, grasa: 0.3 },
      colacion: { proteina: 0.1, carbohidrato: 0.1, grasa: 0.15 },
      cena: { proteina: 0.2, carbohidrato: 0.15, grasa: 0.25 }
    };

    if (this.requiredMealTimes === 3 || this.iaDistributionWizard.mealsPerDay === 3) {
      base.media_manana = { proteina: 0.03, carbohidrato: 0.03, grasa: 0.03 };
      base.colacion = { proteina: 0.03, carbohidrato: 0.03, grasa: 0.03 };
      base.desayuno.proteina += 0.07;
      base.almuerzo.carbohidrato += 0.07;
      base.cena.grasa += 0.07;
    }

    if (this.requiredMealTimes === 3 || !this.iaDistributionWizard.includeSnacks) {
      base.media_manana = { proteina: 0.01, carbohidrato: 0.01, grasa: 0.01 };
      base.colacion = { proteina: 0.01, carbohidrato: 0.01, grasa: 0.01 };
      base.desayuno.proteina += 0.05;
      base.almuerzo.carbohidrato += 0.05;
      base.cena.grasa += 0.05;
    }

    if (this.iaDistributionWizard.priority === 'proteina') {
      base.desayuno.proteina += 0.05;
      base.almuerzo.proteina += 0.05;
      base.cena.proteina += 0.05;
    }
    if (this.iaDistributionWizard.priority === 'carbohidrato') {
      base.desayuno.carbohidrato += 0.06;
      base.almuerzo.carbohidrato += 0.06;
      base.cena.carbohidrato += 0.03;
    }
    if (this.iaDistributionWizard.priority === 'grasa') {
      base.almuerzo.grasa += 0.05;
      base.cena.grasa += 0.07;
    }

    if (this.iaDistributionWizard.carbTiming === 'temprano') {
      base.desayuno.carbohidrato += 0.1;
      base.media_manana.carbohidrato += 0.05;
      base.cena.carbohidrato = Math.max(0.05, base.cena.carbohidrato - 0.12);
    }
    if (this.iaDistributionWizard.carbTiming === 'tarde') {
      base.cena.carbohidrato += 0.1;
      base.almuerzo.carbohidrato += 0.05;
      base.desayuno.carbohidrato = Math.max(0.08, base.desayuno.carbohidrato - 0.1);
    }

    if (this.iaDistributionWizard.lightDinner) {
      base.cena.grasa = Math.max(0.08, base.cena.grasa - 0.1);
      base.cena.carbohidrato = Math.max(0.08, base.cena.carbohidrato - 0.08);
      base.almuerzo.grasa += 0.06;
      base.almuerzo.carbohidrato += 0.06;
    }

    return this.normalizeDistributionProfile(base);
  }

  private normalizeDistributionProfile(
    profile: Record<string, { proteina: number; carbohidrato: number; grasa: number }>
  ): Record<string, { proteina: number; carbohidrato: number; grasa: number }> {
    (['proteina', 'carbohidrato', 'grasa'] as const).forEach(macro => {
      const sum = Object.values(profile).reduce((acc, meal) => acc + Math.max(0, meal[macro]), 0);
      if (sum <= 0) {
        const even = 1 / Object.keys(profile).length;
        Object.values(profile).forEach(meal => {
          meal[macro] = even;
        });
        return;
      }

      Object.values(profile).forEach(meal => {
        meal[macro] = Math.max(0, meal[macro]) / sum;
      });
    });

    return profile;
  }

  getWizardPreviewRows() {
    if (!this.pautaNutricional.calorias) {
      return [] as Array<{
        mealId: string;
        mealTitle: string;
        proteinaPct: number;
        carbohidratoPct: number;
        grasaPct: number;
        proteinaG: number;
        carbohidratoG: number;
        grasaG: number;
        caloriasEstimadas: number;
      }>;
    }

    const profile = this.buildWizardDistributionProfile();
    return Object.entries(profile).map(([mealId, weights]) => {
      const proteinaG = this.pautaNutricional.proteinas * weights.proteina;
      const carbohidratoG = this.pautaNutricional.carbohidratos * weights.carbohidrato;
      const grasaG = this.pautaNutricional.grasas * weights.grasa;
      const caloriasEstimadas = proteinaG * 4 + carbohidratoG * 4 + grasaG * 9;

      return {
        mealId,
        mealTitle: this.getMealTitleById(mealId),
        proteinaPct: weights.proteina,
        carbohidratoPct: weights.carbohidrato,
        grasaPct: weights.grasa,
        proteinaG,
        carbohidratoG,
        grasaG,
        caloriasEstimadas
      };
    });
  }

  getWizardPreviewCaloriesTotal(): number {
    return this.getWizardPreviewRows().reduce((sum, row) => sum + row.caloriasEstimadas, 0);
  }

  getWizardPreviewQuality() {
    const proteinaPortion = this.availablePortions.find(p => p.id === this.macroPortionMap.proteina);
    const carboPortion = this.availablePortions.find(p => p.id === this.macroPortionMap.carbohidrato);
    const grasaPortion = this.availablePortions.find(p => p.id === this.macroPortionMap.grasa);

    if (!proteinaPortion || !carboPortion || !grasaPortion || !this.pautaNutricional.calorias) {
      return {
        label: 'Sin datos',
        tone: 'muted',
        note: 'Completa macros para evaluar calidad de ajuste.',
        proteinaDeltaPct: 0,
        carboDeltaPct: 0,
        grasaDeltaPct: 0,
        caloriasDeltaPct: 0
      };
    }

    const proteinaUnit = this.getDominantGramsValue(proteinaPortion);
    const carboUnit = this.getDominantGramsValue(carboPortion);
    const grasaUnit = this.getDominantGramsValue(grasaPortion);

    const proteinaTarget = this.pautaNutricional.proteinas;
    const carboTarget = this.pautaNutricional.carbohidratos;
    const grasaTarget = this.pautaNutricional.grasas;

    const proteinaProjected = Math.round(proteinaTarget / Math.max(1, proteinaUnit)) * proteinaUnit;
    const carboProjected = Math.round(carboTarget / Math.max(1, carboUnit)) * carboUnit;
    const grasaProjected = Math.round(grasaTarget / Math.max(1, grasaUnit)) * grasaUnit;

    const caloriasProjected = proteinaProjected * 4 + carboProjected * 4 + grasaProjected * 9;

    const proteinaDeltaPct = proteinaTarget > 0 ? Math.abs(proteinaProjected - proteinaTarget) / proteinaTarget : 0;
    const carboDeltaPct = carboTarget > 0 ? Math.abs(carboProjected - carboTarget) / carboTarget : 0;
    const grasaDeltaPct = grasaTarget > 0 ? Math.abs(grasaProjected - grasaTarget) / grasaTarget : 0;
    const caloriasDeltaPct = this.pautaNutricional.calorias > 0
      ? Math.abs(caloriasProjected - this.pautaNutricional.calorias) / this.pautaNutricional.calorias
      : 0;

    const maxMacroDelta = Math.max(proteinaDeltaPct, carboDeltaPct, grasaDeltaPct);
    const macroTol = this.macroTolerance;

    if (maxMacroDelta <= macroTol && caloriasDeltaPct <= 0.05) {
      return {
        label: 'Muy alineado',
        tone: 'success',
        note: 'La distribución proyectada cae dentro de tolerancias objetivo.',
        proteinaDeltaPct,
        carboDeltaPct,
        grasaDeltaPct,
        caloriasDeltaPct
      };
    }

    if (maxMacroDelta <= macroTol * 1.5 && caloriasDeltaPct <= 0.08) {
      return {
        label: 'Alineado',
        tone: 'warning',
        note: 'La propuesta es utilizable, pero probablemente requerirá ajuste fino.',
        proteinaDeltaPct,
        carboDeltaPct,
        grasaDeltaPct,
        caloriasDeltaPct
      };
    }

    return {
      label: 'Requiere ajuste',
      tone: 'danger',
      note: 'La granularidad de porciones puede dejar desviaciones relevantes.',
      proteinaDeltaPct,
      carboDeltaPct,
      grasaDeltaPct,
      caloriasDeltaPct
    };
  }

  private getMealTitleById(mealId: string): string {
    return this.dailyMealPlan.meals.find(meal => meal.id === mealId)?.title || mealId;
  }

  getVisibleMeals() {
    const visibleMealIds = new Set(this.getRequiredMealIds());
    return this.dailyMealPlan.meals.filter(meal => visibleMealIds.has(meal.id));
  }

  getRequiredMealTimesLabel(): string {
    return this.requiredMealTimes === 3 ? '3 tiempos obligatorios' : '5 tiempos obligatorios';
  }

  getRequiredMealNamesLabel(): string {
    return this.getRequiredMealIds()
      .map(mealId => this.getMealTitleById(mealId))
      .join(', ');
  }

  getVisibleMealSuggestions(): MealSuggestion[] {
    return this.mealSuggestions.filter(suggestion => suggestion.targetCalorias > 0);
  }

  hasRequiredMealTimesConfigured(): boolean {
    const requiredMealIds = this.getRequiredMealIds();
    return requiredMealIds.every(mealId => {
      const meal = this.dailyMealPlan.meals.find(currentMeal => currentMeal.id === mealId);
      return !!meal?.portions.length;
    });
  }

  getMealTimeRequirementError(): string | null {
    if (this.hasRequiredMealTimesConfigured()) {
      return null;
    }

    return `Debes completar ${this.requiredMealTimes} tiempos de comida en este flujo: ${this.getRequiredMealNamesLabel()}.`;
  }

  private buildEmptyDailyPlan(): DailyMealPlan {
    return {
      day: 'Semana tipo',
      meals: [
        { id: 'desayuno', title: 'Desayuno', portions: [] },
        { id: 'media_manana', title: 'Media mañana', portions: [] },
        { id: 'almuerzo', title: 'Almuerzo', portions: [] },
        { id: 'colacion', title: 'Colación', portions: [] },
        { id: 'cena', title: 'Cena', portions: [] }
      ]
    };
  }

  planTienePorciones() {
    return this.getVisibleMeals().some(meal => meal.portions.length > 0);
  }

  private agregarPorcionAMeal(portionId: string, mealId: string) {
    const base = this.availablePortions.find(p => p.id === portionId);
    const meal = this.dailyMealPlan.meals.find(m => m.id === mealId);
    if (!base || !meal) {
      return;
    }
    meal.portions = [...meal.portions, this.clonePortion(base)];
  }

  private clonePortion(portion: MealPortion): MealPortionAssignment {
    const randomId = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${portion.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return {
      ...portion,
      instanceId: randomId,
      units: 1
    };
  }

  private initPortionGrams() {
    this.portionGrams = {};
    this.availablePortions.forEach(portion => {
      const standard = this.getDominantGramsValue(portion);
      this.defaultPortionGrams[portion.id] = standard;
      this.portionGrams[portion.id] = standard;
      this.applyDominantGrams(portion, standard);
    });
  }

  private getDominantGramsValue(portion: MealPortion): number {
    switch (portion.macroDominante) {
      case 'proteina':
        return portion.proteinas;
      case 'carbohidrato':
        return portion.carbohidratos;
      case 'grasa':
        return portion.grasas;
      default:
        return 0;
    }
  }

  private applyDominantGrams(portion: MealPortion, grams: number) {
    const range = this.getPortionRange(portion);
    const safeGrams = this.clampGrams(grams, range.min, range.max);
    portion.proteinas = portion.macroDominante === 'proteina' ? safeGrams : 0;
    portion.carbohidratos = portion.macroDominante === 'carbohidrato' ? safeGrams : 0;
    portion.grasas = portion.macroDominante === 'grasa' ? safeGrams : 0;
    portion.calorias = this.calculateCalories(portion);
  }

  private calculateCalories(portion: MealPortion): number {
    const calories = portion.proteinas * 4 + portion.carbohidratos * 4 + portion.grasas * 9;
    return Math.round(calories);
  }

  private clampGrams(value: number, min = 0, max = 100): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  private buildMenuFromPlan(): string[] {
    if (!this.planTienePorciones()) {
      return this.isAIEnabled ? this.generarMenuIA() : this.generarMenuBasico();
    }
    return this.dailyMealPlan.meals.map(meal => {
      if (!meal.portions.length) {
        return `${meal.title}: sin asignar`;
      }
      const items = meal.portions
        .map(portion => `${portion.label} x${portion.units}`)
        .join(', ');
      return `${meal.title}: ${items}`;
    });
  }

  getCaloriesProgress() {
    const totals = this.getDailyTotals();
    const target = this.pautaNutricional.calorias || 0;
    const delta = target - totals.calorias;
    const pct = target > 0 ? Math.min(130, Math.round((totals.calorias / target) * 100)) : 0;
    return { current: Math.round(totals.calorias), target, delta, pct };
  }

  private validarPacienteCompleto(): boolean {
    const errores: string[] = [];
    if (!this.pacienteSeleccionado) {
      errores.push('Selecciona un paciente activo.');
    }

    const edad = this.obtenerEdadReferencia();
    const peso = parseFloat(this.paciente.peso);
    const altura = parseFloat(this.paciente.altura);

    if (!edad || edad <= 0) {
      errores.push('Completa una edad válida.');
    }
    if (!peso || peso <= 0) {
      errores.push('Completa un peso válido.');
    }
    if (!altura || altura <= 0) {
      errores.push('Completa una altura válida.');
    }
    if (!this.paciente.actividad) {
      errores.push('Selecciona el nivel de actividad.');
    }
    if (!this.paciente.objetivo) {
      errores.push('Selecciona el objetivo nutricional.');
    }

    if (errores.length) {
      alert(`Revisa los datos del paciente antes de continuar:\n- ${errores.join('\n- ')}`);
      return false;
    }
    return true;
  }

  private validarDatosContraEscenario(): boolean {
    if (!this.scenarioPreset) {
      return true;
    }

    const errores = this.obtenerErroresEscenario();
    if (errores.length) {
      alert(`⚠️ Para continuar debes replicar exactamente el caso del escenario:
- ${errores.join('\n- ')}`);
      return false;
    }
    return true;
  }

  private compararNumero(
    label: string,
    actual: number | null,
    esperado: number | undefined,
    errores: string[],
    unidad: string
  ) {
    if (esperado === undefined) {
      return;
    }
    if (actual === null || Number.isNaN(actual)) {
      errores.push(`${label} (${esperado} ${unidad}) debe completarse.`);
      return;
    }
    const tolerancia = 0;
    if (Math.abs(actual - esperado) > tolerancia) {
      errores.push(`${label} debe ser ${esperado} ${unidad}. Valor actual: ${actual} ${unidad}.`);
    }
  }

  private traducirActividad(valor: 'sedentario' | 'ligero' | 'moderado' | 'intenso'): string {
    switch (valor) {
      case 'sedentario':
        return 'Sedentario';
      case 'ligero':
        return 'Actividad ligera';
      case 'moderado':
        return 'Actividad moderada';
      case 'intenso':
        return 'Actividad intensa';
    }
  }

  private traducirObjetivo(valor: 'perder' | 'mantener' | 'ganar'): string {
    switch (valor) {
      case 'perder':
        return 'Perder peso';
      case 'mantener':
        return 'Mantener peso';
      case 'ganar':
        return 'Ganar peso';
    }
  }

  private ensureScenarioPreset(): boolean {
    if (this.scenarioPreset) {
      this.syncScenarioMealConstraint();
      return true;
    }
    const current = this.scenarioService.getCurrentScenario();
    if (current) {
      this.scenarioPreset = current.scenario.patientPreset;
      this.scenarioPatientName = current.scenario.patientName;
      this.requiredMealTimes = current.scenario.requiredMealTimes;
      this.syncScenarioMealConstraint();
      return true;
    }
    alert('Debes tener un flujo en curso desde el panel derecho para avanzar al siguiente subpaso.');
    return false;
  }

  get scenarioBlockingErrors(): string[] {
    if (!this.scenarioPreset) {
      return [];
    }
    return this.obtenerErroresEscenario();
  }

  private obtenerErroresEscenario(): string[] {
    if (!this.scenarioPreset) {
      return [];
    }
    const errores: string[] = [];
    const preset = this.scenarioPreset;

    if (!this.pacienteSeleccionado) {
      errores.push('Selecciona el paciente indicado en el escenario.');
    } else if (this.scenarioPatientName) {
      const fullName = `${this.pacienteSeleccionado.nombre} ${this.pacienteSeleccionado.apellido}`.trim();
      if (fullName !== this.scenarioPatientName) {
        errores.push(`Paciente seleccionado: ${fullName}. Debe ser ${this.scenarioPatientName}.`);
      }
    }

    const edadActual = this.obtenerEdadReferencia();
    this.compararNumero('Edad', edadActual, preset.edad, errores, 'años');
    this.compararNumero('Peso', parseFloat(this.paciente.peso), preset.peso, errores, 'kg');
    this.compararNumero('Altura', parseFloat(this.paciente.altura), preset.altura, errores, 'cm');
    this.compararNumero('Masa grasa', parseFloat(this.paciente.masaGrasa), preset.masaGrasa, errores, 'kg');
    this.compararNumero('Masa magra', parseFloat(this.paciente.masaMagra), preset.masaMagra, errores, 'kg');

    if (preset.actividad && this.paciente.actividad !== preset.actividad) {
      errores.push(`Nivel de actividad debe ser "${this.traducirActividad(preset.actividad)}".`);
    }
    if (preset.objetivo && this.paciente.objetivo !== preset.objetivo) {
      errores.push(`Objetivo debe ser "${this.traducirObjetivo(preset.objetivo)}".`);
    }

    return errores;
  }

  private obtenerEdadReferencia(): number | null {
    if (this.paciente.edad) {
      const edadManual = parseInt(this.paciente.edad, 10);
      if (!isNaN(edadManual) && edadManual > 0) {
        return edadManual;
      }
    }
    if (this.pacienteSeleccionado?.edad) {
      return this.pacienteSeleccionado.edad;
    }
    return null;
  }

  get macroCalculationBreakdown(): {
    edad: number;
    peso: number;
    altura: number;
    tmb: number;
    factorActividad: number;
    actividadLabel: string;
    caloriasBase: number;
    ajusteObjetivo: number;
    caloriasObjetivo: number;
    proteinaBase: number;
    proteinaBaseOrigen: string;
    proteinasPorKg: number;
    proteinasDia: number;
    caloriasPostProteina: number;
    grasasDia: number;
    carbohidratosDia: number;
  } | null {
    const edad = this.obtenerEdadReferencia();
    const peso = parseFloat(this.paciente.peso);
    const altura = parseFloat(this.paciente.altura);

    if (!edad || edad <= 0 || !peso || peso <= 0 || !altura || altura <= 0) {
      return null;
    }

    const factorActividad = {
      sedentario: 1.2,
      ligero: 1.375,
      moderado: 1.55,
      intenso: 1.725
    } as const;

    const actividadActual = this.paciente.actividad as keyof typeof factorActividad;
    const factor = factorActividad[actividadActual] ?? 1.2;
    const tmb = 88.362 + (13.397 * peso) + (4.799 * altura) - (5.677 * edad);
    const caloriasBase = tmb * factor;

    const ajusteObjetivo = this.paciente.objetivo === 'perder'
      ? -500
      : this.paciente.objetivo === 'ganar'
        ? 500
        : 0;
    const caloriasObjetivo = caloriasBase + ajusteObjetivo;

    const masaMagra = parseFloat(this.paciente.masaMagra || '0');
    const masaGrasa = parseFloat(this.paciente.masaGrasa || '0');
    const usaMasaMagra = masaMagra > 0;
    const proteinaBase = usaMasaMagra ? masaMagra : Math.max(0, peso - masaGrasa);
    const proteinaBaseOrigen = usaMasaMagra ? 'masa magra' : 'peso - masa grasa';

    const proteinasPorKg = this.paciente.objetivo === 'ganar'
      ? 1.8
      : this.paciente.objetivo === 'perder'
        ? 1.6
        : 1.4;
    const proteinasDia = Math.max(0, Math.round(proteinaBase * proteinasPorKg));

    const caloriasPostProteina = Math.max(0, caloriasObjetivo - proteinasDia * 4);
    const grasasDia = Math.round((caloriasPostProteina * 0.35) / 9);
    const carbohidratosDia = Math.max(0, Math.round((caloriasObjetivo - proteinasDia * 4 - grasasDia * 9) / 4));

    return {
      edad,
      peso,
      altura,
      tmb,
      factorActividad: factor,
      actividadLabel: this.traducirActividad(actividadActual),
      caloriasBase,
      ajusteObjetivo,
      caloriasObjetivo,
      proteinaBase,
      proteinaBaseOrigen,
      proteinasPorKg,
      proteinasDia,
      caloriasPostProteina,
      grasasDia,
      carbohidratosDia
    };
  }

  generarRecomendacionesBasicas(): string {
    const masaMagra = parseFloat(this.paciente.masaMagra || '0');
    const proteinasObjetivo = masaMagra > 0 ? Math.round(masaMagra * 1.6) : Math.round(parseFloat(this.paciente.peso || '0') * 1.2);
    const mealPattern = this.requiredMealTimes === 3
      ? 'Realizar 3 comidas principales'
      : 'Realizar 3 comidas principales y 2 colaciones';
    return `
      - ${mealPattern}
      - Incluir aproximadamente ${proteinasObjetivo}g de proteínas totales al día
      - Consumir al menos 5 porciones de frutas y verduras al día
      - Beber 8 vasos de agua diarios
      - Evitar alimentos ultraprocesados
    `;
  }

  generarRecomendacionesIA(): string {
    if (!this.pacienteSeleccionado) return this.generarRecomendacionesBasicas();
    
    return this.dataService.generarSugerenciaIA(this.pacienteSeleccionado.id);
  }

  generarMenuBasico(): string[] {
    return this.flujoAsignado?.objetivoFinal?.menuSugerido ?? [
      'Desayuno: Avena con frutas y frutos secos',
      'Media mañana: Yogur natural con almendras',
      'Almuerzo: Pollo grillado con ensalada mixta',
      'Once: Té con tostadas integrales',
      'Cena: Pescado al horno con verduras'
    ];
  }

  generarMenuIA(): string[] {
    if (this.flujoAsignado?.objetivoFinal?.menuSugerido) {
      return this.flujoAsignado.objetivoFinal.menuSugerido;
    }

    // Menú personalizado si no hay objetivo común definido
    if (this.paciente.objetivo === 'perder') {
      return [
        'Desayuno: Huevos revueltos con espinacas (bajo en carbohidratos)',
        'Media mañana: Yogur griego con berries',
        'Almuerzo: Salmón con quinoa y brócoli al vapor',
        'Once: Té verde con almendras (5 unidades)',
        'Cena: Pechuga de pollo con ensalada mediterránea'
      ];
    } else if (this.paciente.objetivo === 'ganar') {
      return [
        'Desayuno: Avena con plátano, miel y nueces',
        'Media mañana: Batido de proteínas con frutas',
        'Almuerzo: Arroz integral con pollo y palta',
        'Once: Pan integral con palta y huevo',
        'Cena: Pasta integral con salmón y verduras'
      ];
    } else {
      return [
        'Desayuno: Tostadas integrales con palta y tomate',
        'Media mañana: Fruta de estación con yogur',
        'Almuerzo: Ensalada completa con proteína magra',
        'Once: Té con galletas integrales',
        'Cena: Pescado con arroz y verduras salteadas'
      ];
    }
  }

  simularAnalisisIA() {
    this.registrarInteraccion();
    if (!this.pacienteSeleccionado) {
      alert('Primero debe seleccionar un paciente');
      return;
    }
    
    // Simulación de análisis con IA
    const sugerencia = this.dataService.generarSugerenciaIA(this.pacienteSeleccionado.id);
    alert('🤖 ANÁLISIS COMPLETO CON IA:\n\n' + sugerencia);
  }

  verHistorialPaciente() {
    if (this.pacienteSeleccionado) {
      this.router.navigate(['/seguimiento'], { 
        queryParams: { pacienteId: this.pacienteSeleccionado.id } 
      });
    }
  }

  private actualizarFlujoParaPaciente(pacienteId: string) {
    this.flujoAsignado = this.workflowService.getAsignacionActiva(pacienteId) || null;
    if (this.flujoAsignado) {
      this.flujoDetalle = this.workflowService.getFlujoById(this.flujoAsignado.flujoId) || null;
      this.pasosFlujo = this.flujoDetalle ? [...this.flujoDetalle.pasos].sort((a, b) => a.orden - b.orden) : [];
    } else {
      this.flujoDetalle = null;
      this.pasosFlujo = [];
    }
    this.syncScenarioMealConstraint();
    this.syncAIMode();
    this.actualizarPasoEnEjecucion();
  }

  private syncScenarioMealConstraint() {
    const currentScenario = this.scenarioService.getCurrentScenario();
    if (currentScenario) {
      this.requiredMealTimes = currentScenario.scenario.requiredMealTimes;
      this.scenarioPreset = currentScenario.scenario.patientPreset;
      this.scenarioPatientName = currentScenario.scenario.patientName;
    } else if (this.pacienteSeleccionado?.id === 'pac_manual') {
      this.requiredMealTimes = 3;
    } else {
      this.requiredMealTimes = 5;
    }

    this.iaDistributionWizard.mealsPerDay = this.requiredMealTimes;
    this.iaDistributionWizard.includeSnacks = this.requiredMealTimes === 5;
    this.enforceRequiredMealVisibility();
  }

  private getRequiredMealIds(): string[] {
    return [...(this.requiredMealTimes === 3 ? this.threeMealOrder : this.allMealOrder)];
  }

  private enforceRequiredMealVisibility() {
    if (this.requiredMealTimes !== 3) {
      return;
    }

    this.dailyMealPlan.meals = this.dailyMealPlan.meals.map(meal => {
      if (meal.id === 'media_manana' || meal.id === 'colacion') {
        return { ...meal, portions: [] };
      }
      return meal;
    });
  }

  private syncAIMode() {
    if (this.flujoAsignado) {
      this.isAIEnabled = this.flujoAsignado.modoEjecutado === 'con-ia';
      return;
    }
    this.isAIEnabled = this.versionService.isAIEnabled();
  }

  private actualizarPasoEnEjecucion() {
    if (!this.flujoAsignado || !this.pasosFlujo.length || this.flujoAsignado.estado === 'completado') {
      this.pasoEnEjecucion = null;
      this.pasoMetricasActualId = null;
      return;
    }

    this.completarPasoPacientePendienteSiCorresponde();

    const pasoActual = this.pasosFlujo.find(p => p.id === this.flujoAsignado?.pasoActualId);
    const pasoPendiente = this.pasosFlujo.find(paso => !this.flujoAsignado!.ejecucion.some(e => e.pasoId === paso.id && e.fin));
    this.pasoEnEjecucion = pasoActual || pasoPendiente || null;
    this.iniciarPasoEvaluacionSiCorresponde();
    const pasoActualId = this.pasoEnEjecucion?.id ?? null;
    if (pasoActualId !== this.pasoMetricasActualId) {
      this.pasoMetricasActualId = pasoActualId;
      this.prepararFeedbackBase();
      this.resetMetricasPasoRuntime();
    }
  }

  private completarPasoPacientePendienteSiCorresponde() {
    if (!this.flujoAsignado || !this.pacienteSeleccionado) {
      return;
    }

    const pasoPacientePendiente = this.pasosFlujo.find(paso =>
      paso.modulo === 'pacientes' &&
      !this.flujoAsignado!.ejecucion.some(e => e.pasoId === paso.id && !!e.fin)
    );

    if (!pasoPacientePendiente) {
      return;
    }

    this.workflowService.completePaso(
      this.flujoAsignado.id,
      pasoPacientePendiente.id,
      this.buildPayloadPaso('Cierre automático de fase paciente al iniciar evaluación.')
    );

    this.flujoAsignado = this.workflowService.getAsignacionActiva(this.flujoAsignado.pacienteId) || this.flujoAsignado;
  }

  private iniciarPasoEvaluacionSiCorresponde() {
    if (!this.flujoAsignado || !this.pasoEnEjecucion || this.pasoEnEjecucion.modulo !== 'evaluacion') {
      return;
    }
    const registro = this.flujoAsignado.ejecucion.find(e => e.pasoId === this.pasoEnEjecucion?.id);
    if (registro) {
      return;
    }
    this.workflowService.startPaso(this.flujoAsignado.id, this.pasoEnEjecucion.id);
    this.flujoAsignado = this.workflowService.getAsignacionActiva(this.flujoAsignado.pacienteId) || this.flujoAsignado;
  }

  private prepararFeedbackBase() {
    this.feedbackPaso = {
      facilidad: this.isAIEnabled ? 4 : 3,
      camposAutocompletados: this.isAIEnabled ? 0 : 0,
      camposManuales: 0,
      comentarios: ''
    };
  }

  private calcularEstimacionComposicion(pacienteId: string) {
    const registros = this.dataService.getRegistrosByPaciente(pacienteId);
    const ultimo = registros[0];
    if (!ultimo) {
      this.estimacionMasaGrasa = 0;
      this.estimacionMasaMagra = 0;
      this.porcentajeGrasaEstimado = 0;
      return;
    }

    const alturaM = ultimo.altura / 100;
    const imc = ultimo.peso / (alturaM * alturaM);
    let porcentaje = 0.28;
    if (imc < 18.5) {
      porcentaje = 0.15;
    } else if (imc < 25) {
      porcentaje = 0.22;
    } else if (imc < 30) {
      porcentaje = 0.30;
    } else {
      porcentaje = 0.38;
    }

    if (ultimo.objetivo === 'ganar') {
      porcentaje = Math.max(0.12, porcentaje - 0.02);
    } else if (ultimo.objetivo === 'perder') {
      porcentaje = porcentaje + 0.02;
    }

    this.porcentajeGrasaEstimado = +(porcentaje * 100).toFixed(1);
    this.estimacionMasaGrasa = +(ultimo.peso * porcentaje).toFixed(1);
    this.estimacionMasaMagra = +(ultimo.peso - this.estimacionMasaGrasa).toFixed(1);
  }

  getEstadoPaso(paso: PasoFlujo): 'pendiente' | 'en-progreso' | 'completado' {
    if (!this.flujoAsignado) {
      return 'pendiente';
    }
    const registro = this.flujoAsignado.ejecucion.find(e => e.pasoId === paso.id);
    if (registro?.fin) {
      return 'completado';
    }
    if (registro) {
      return 'en-progreso';
    }
    return 'pendiente';
  }

  iniciarPaso(paso: PasoFlujo) {
    if (!this.flujoAsignado) {
      return;
    }
    this.workflowService.startPaso(this.flujoAsignado.id, paso.id);
    this.actualizarFlujoParaPaciente(this.flujoAsignado.pacienteId);
  }

  completarPaso(paso: PasoFlujo) {
    if (!this.flujoAsignado) {
      return;
    }

    const registro = this.flujoAsignado.ejecucion.find(e => e.pasoId === paso.id);
    if (!registro) {
      this.workflowService.startPaso(this.flujoAsignado.id, paso.id);
    }

    this.workflowService.completePaso(this.flujoAsignado.id, paso.id, this.buildPayloadPaso(this.feedbackPaso.comentarios));
    this.actualizarFlujoParaPaciente(this.flujoAsignado.pacienteId);
  }

  private completarPasoPorId(pasoId: string, comentarios?: string) {
    if (!this.flujoAsignado) {
      return;
    }

    this.workflowService.completePaso(this.flujoAsignado.id, pasoId, this.buildPayloadPaso(comentarios));
    this.actualizarFlujoParaPaciente(this.flujoAsignado.pacienteId);
  }

  registrarEdicionCampo(campo: string) {
    this.registrarInteraccion();
    this.camposEditadosPaso.add(campo);
    if (this.camposSugeridosIA.has(campo) && !this.camposAceptadosIA.has(campo)) {
      this.camposCorregidosIA.add(campo);
      this.metricasPasoRuntime.iaCorregidas = this.camposCorregidosIA.size;
    }
  }

  private registrarInteraccion(cantidad = 1) {
    this.metricasPasoRuntime.interacciones += Math.max(0, cantidad);
  }

  private registrarSugerenciaIA(...campos: string[]) {
    campos.forEach(campo => this.camposSugeridosIA.add(campo));
    this.metricasPasoRuntime.iaSugerencias = this.camposSugeridosIA.size;
  }

  private registrarAceptacionIA(...campos: string[]) {
    campos.forEach(campo => {
      if (this.camposSugeridosIA.has(campo)) {
        this.camposAceptadosIA.add(campo);
      }
    });
    this.metricasPasoRuntime.iaAceptadas = this.camposAceptadosIA.size;
  }

  private resetMetricasPasoRuntime() {
    this.metricasPasoRuntime = {
      interacciones: 0,
      iaSugerencias: 0,
      iaAceptadas: 0,
      iaCorregidas: 0
    };
    this.camposEditadosPaso.clear();
    this.camposSugeridosIA.clear();
    this.camposAceptadosIA.clear();
    this.camposCorregidosIA.clear();
  }

  private buildPayloadPaso(comentariosOverride?: string) {
    const camposAutocompletados = this.isAIEnabled
      ? Math.max(this.feedbackPaso.camposAutocompletados, this.camposSugeridosIA.size)
      : 0;
    const camposManuales = Math.max(this.feedbackPaso.camposManuales, this.camposEditadosPaso.size);

    return {
      facilidad: this.feedbackPaso.facilidad,
      comentarios: comentariosOverride ?? this.feedbackPaso.comentarios,
      camposAutocompletados,
      camposManuales,
      interacciones: this.metricasPasoRuntime.interacciones,
      iaSugerencias: this.metricasPasoRuntime.iaSugerencias,
      iaAceptadas: this.metricasPasoRuntime.iaAceptadas,
      iaCorregidas: this.metricasPasoRuntime.iaCorregidas
    };
  }

  private estaPasoCompletado(pasoId: string): boolean {
    if (!this.flujoAsignado) {
      return false;
    }
    return this.flujoAsignado.ejecucion.some(e => e.pasoId === pasoId && !!e.fin);
  }

  private getPasoMenuRealId(): string | null {
    if (!this.flujoAsignado) {
      return null;
    }
    const pasoId = this.flujoAsignado.modoEjecutado === 'con-ia' ? 'evaluacion_ia_3' : 'evaluacion_3';
    return this.pasosFlujo.some(p => p.id === pasoId) ? pasoId : null;
  }

  private getPasoCierrePautaId(): string | null {
    if (!this.flujoAsignado) {
      return null;
    }
    const nuevoPaso = this.flujoAsignado.modoEjecutado === 'con-ia' ? 'evaluacion_ia_4' : 'evaluacion_4';
    if (this.pasosFlujo.some(p => p.id === nuevoPaso)) {
      return nuevoPaso;
    }

    const pasoLegacy = this.flujoAsignado.modoEjecutado === 'con-ia' ? 'evaluacion_ia_3' : 'evaluacion_3';
    return this.pasosFlujo.some(p => p.id === pasoLegacy) ? pasoLegacy : null;
  }

  getProgresoFlujo(): number {
    if (!this.flujoAsignado || !this.pasosFlujo.length) {
      return 0;
    }
    const total = this.pasosFlujo.length;
    const completados = this.flujoAsignado.ejecucion.filter(e => e.fin).length;
    return Math.round((completados / total) * 100);
  }
}
