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
  ScenarioPatientPreset
} from '../models/nutricion.models';
import { ScenarioService } from '../services/scenario.service';
import { WorkflowService } from '../services/workflow.service';

@Component({
  selector: 'app-evaluacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './evaluacion.component.html',
  styleUrl: './evaluacion.component.scss'
})
export class EvaluacionComponent implements OnInit {
  isAIEnabled = false;
  pacienteSeleccionado: Paciente | null = null;
  pacientes: Paciente[] = [];
  currentStep: 1 | 2 = 1;
  scenarioPreset: ScenarioPatientPreset | null = null;
  scenarioPatientName: string | null = null;
  
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
      label: 'Porción de grasa saludable',
      descripcion: '15g grasas mono/poli',
      macroDominante: 'grasa',
      calorias: 135,
      proteinas: 0,
      carbohidratos: 0,
      grasas: 15
    }
  ];

  private macroOrder: MealPortion['macroDominante'][] = ['proteina', 'carbohidrato', 'grasa'];
  private macroPortionMap: Record<MealPortion['macroDominante'], string> = {
    proteina: 'macro-proteina',
    carbohidrato: 'macro-carbo',
    grasa: 'macro-grasa',
    mixto: 'macro-carbo'
  };

  dailyMealPlan: DailyMealPlan = this.buildEmptyDailyPlan();
  private macroTolerance = 0.08;

  flujoAsignado: FlujoAsignado | null = null;
  flujoDetalle: FlujoTrabajo | null = null;
  pasosFlujo: PasoFlujo[] = [];
  pasoEnEjecucion: PasoFlujo | null = null;
  feedbackPaso = {
    facilidad: 3,
    camposAutocompletados: 0,
    camposManuales: 0,
    comentarios: ''
  };
  estimacionMasaGrasa = 0;
  estimacionMasaMagra = 0;
  porcentajeGrasaEstimado = 0;

  constructor(
    private versionService: VersionService,
    public dataService: DataService,
    private route: ActivatedRoute,
    private router: Router,
    private workflowService: WorkflowService,
    private scenarioService: ScenarioService
  ) {}

  ngOnInit() {
    this.versionService.version$.subscribe(version => {
      this.isAIEnabled = this.versionService.isAIEnabled();
      this.prepararFeedbackBase();
      if (this.pacienteSeleccionado) {
        this.calcularEstimacionComposicion(this.pacienteSeleccionado.id);
      }
    });

    this.dataService.pacientes$.subscribe(pacientes => {
      this.pacientes = pacientes.filter(p => p.activo);
    });

    this.scenarioService.activeProgress$.subscribe(progress => {
      if (progress) {
        const scenario = this.scenarioService.getScenario(progress.scenarioId);
        this.scenarioPreset = scenario.patientPreset;
        this.scenarioPatientName = scenario.patientName;
        this.currentStep = 1;
      } else {
        this.scenarioPreset = null;
        this.scenarioPatientName = null;
        this.currentStep = 1;
      }
    });

    // Verificar si viene un paciente específico desde la URL
    this.route.queryParams.subscribe(params => {
      if (params['pacienteId']) {
        const paciente = this.dataService.getPacienteById(params['pacienteId']);
        if (paciente) {
          this.seleccionarPaciente(paciente);
        }
      }
    });
  }

  seleccionarPaciente(paciente: Paciente) {
    this.currentStep = 1;
    this.pacienteSeleccionado = paciente;
    this.paciente.id = paciente.id;
    this.paciente.nombre = `${paciente.nombre} ${paciente.apellido}`;
    this.paciente.edad = paciente.edad?.toString() || '';
    this.pautaNutricional = {
      calorias: 0,
      proteinas: 0,
      carbohidratos: 0,
      grasas: 0,
      recomendaciones: ''
    };
    this.resetMealPlan();
    
    // Si tiene historial, cargar datos del último registro
    const ultimoRegistro = this.dataService.getRegistrosByPaciente(paciente.id)[0];
    if (ultimoRegistro) {
      this.paciente.peso = ultimoRegistro.peso.toString();
      this.paciente.altura = ultimoRegistro.altura.toString();
      this.paciente.actividad = ultimoRegistro.actividad;
      this.paciente.objetivo = ultimoRegistro.objetivo;
      this.paciente.masaGrasa = '';
      this.paciente.masaMagra = '';
    }

    this.calcularEstimacionComposicion(paciente.id);
    this.actualizarFlujoParaPaciente(paciente.id);
  }

  calcularMacrosDiarios() {
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
  }

  guardarPauta() {
    if (this.currentStep !== 2) {
      alert('Debes completar el Paso 2 antes de guardar la pauta.');
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
    this.actualizarFlujoParaPaciente(this.pacienteSeleccionado.id);
    
    // Navegar al seguimiento del paciente
    this.router.navigate(['/seguimiento'], { 
      queryParams: { pacienteId: this.pacienteSeleccionado.id } 
    });
  }

  continuarPaso2() {
    if (!this.pautaNutricional.calorias) {
      alert('Calcula los macros diarios antes de avanzar al Paso 2.');
      return;
    }
    if (!this.validarPacienteCompleto()) {
      return;
    }
    if (!this.ensureScenarioPreset()) {
      return;
    }
    if (!this.validarDatosContraEscenario()) {
      return;
    }
    this.currentStep = 2;
  }

  volverPaso1() {
    this.currentStep = 1;
  }

  onPortionDragStart(event: DragEvent, portionId: string) {
    event.dataTransfer?.setData('text/plain', portionId);
    event.dataTransfer?.setDragImage((event.target as HTMLElement) || document.body, 0, 0);
  }

  allowDrop(event: DragEvent) {
    event.preventDefault();
  }

  onDropPortion(event: DragEvent, mealId: string) {
    event.preventDefault();
    const portionId = event.dataTransfer?.getData('text/plain');
    if (!portionId) {
      return;
    }
    this.agregarPorcionAMeal(portionId, mealId);
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

  incrementMacro(mealId: string, macro: MealPortion['macroDominante']) {
    const portionId = this.macroPortionMap[macro];
    if (!portionId) {
      return;
    }
    this.agregarPorcionAMeal(portionId, mealId);
  }

  decrementMacro(mealId: string, macro: MealPortion['macroDominante']) {
    const meal = this.dailyMealPlan.meals.find(m => m.id === mealId);
    if (!meal) {
      return;
    }
    const target = meal.portions.find(p => p.macroDominante === macro);
    if (!target) {
      return;
    }
    if (target.units > 1) {
      target.units -= 1;
    } else {
      meal.portions = meal.portions.filter(p => p.instanceId !== target.instanceId);
    }
  }

  clearMacro(mealId: string, macro: MealPortion['macroDominante']) {
    const meal = this.dailyMealPlan.meals.find(m => m.id === mealId);
    if (!meal) {
      return;
    }
    meal.portions = meal.portions.filter(p => p.macroDominante !== macro);
  }

  getMacroLabel(macro: MealPortion['macroDominante']): string {
    switch (macro) {
      case 'proteina':
        return 'proteínas';
      case 'carbohidrato':
        return 'carbohidratos';
      case 'grasa':
        return 'grasas';
      default:
        return 'mixtas';
    }
  }

  getDailyTotals() {
    return this.dailyMealPlan.meals.reduce(
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

  planCumpleMacros(): boolean {
    if (!this.pautaNutricional.calorias) {
      return false;
    }
    const totals = this.getDailyTotals();
    const dentroProte = Math.abs(this.pautaNutricional.proteinas - totals.proteinas) <= Math.max(5, this.pautaNutricional.proteinas * this.macroTolerance);
    const dentroCarb = Math.abs(this.pautaNutricional.carbohidratos - totals.carbohidratos) <= Math.max(10, this.pautaNutricional.carbohidratos * this.macroTolerance);
    const dentroGrasa = Math.abs(this.pautaNutricional.grasas - totals.grasas) <= Math.max(5, this.pautaNutricional.grasas * this.macroTolerance);
    return dentroProte && dentroCarb && dentroGrasa;
  }

  resetMealPlan() {
    this.dailyMealPlan = this.buildEmptyDailyPlan();
  }

  sugerirPautaIA() {
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
    return this.dailyMealPlan.meals.some(meal => meal.portions.length > 0);
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
      return true;
    }
    const current = this.scenarioService.getCurrentScenario();
    if (current) {
      this.scenarioPreset = current.scenario.patientPreset;
      this.scenarioPatientName = current.scenario.patientName;
      return true;
    }
    alert('Debes tener un flujo en curso desde el panel derecho para avanzar al Paso 2.');
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

  generarRecomendacionesBasicas(): string {
    const masaMagra = parseFloat(this.paciente.masaMagra || '0');
    const proteinasObjetivo = masaMagra > 0 ? Math.round(masaMagra * 1.6) : Math.round(parseFloat(this.paciente.peso || '0') * 1.2);
    return `
      - Realizar 3 comidas principales y 2 colaciones
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
    this.actualizarPasoEnEjecucion();
  }

  private actualizarPasoEnEjecucion() {
    if (!this.flujoAsignado || !this.pasosFlujo.length || this.flujoAsignado.estado === 'completado') {
      this.pasoEnEjecucion = null;
      return;
    }

    const pasoActual = this.pasosFlujo.find(p => p.id === this.flujoAsignado?.pasoActualId);
    const pasoPendiente = this.pasosFlujo.find(paso => !this.flujoAsignado!.ejecucion.some(e => e.pasoId === paso.id && e.fin));
    this.pasoEnEjecucion = pasoActual || pasoPendiente || null;
    this.prepararFeedbackBase();
  }

  private prepararFeedbackBase() {
    this.feedbackPaso = {
      facilidad: this.isAIEnabled ? 4 : 3,
      camposAutocompletados: this.isAIEnabled ? 6 : 0,
      camposManuales: this.isAIEnabled ? 2 : 6,
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

    if (this.isAIEnabled) {
      this.aplicarEstimacionIA();
    }
  }

  usarEstimacionIA() {
    this.aplicarEstimacionIA(true);
  }

  private aplicarEstimacionIA(forzar = false) {
    if (!this.isAIEnabled || this.estimacionMasaGrasa === 0 || this.estimacionMasaMagra === 0) {
      return;
    }
    if (forzar || !this.paciente.masaGrasa) {
      this.paciente.masaGrasa = this.estimacionMasaGrasa.toString();
    }
    if (forzar || !this.paciente.masaMagra) {
      this.paciente.masaMagra = this.estimacionMasaMagra.toString();
    }
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

    this.workflowService.completePaso(this.flujoAsignado.id, paso.id, {
      facilidad: this.feedbackPaso.facilidad,
      comentarios: this.feedbackPaso.comentarios,
      camposAutocompletados: this.feedbackPaso.camposAutocompletados,
      camposManuales: this.feedbackPaso.camposManuales
    });
    this.actualizarFlujoParaPaciente(this.flujoAsignado.pacienteId);
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
