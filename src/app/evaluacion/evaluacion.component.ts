import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { VersionService } from '../services/version.service';
import { DataService } from '../services/data.service';
import { Paciente, FlujoAsignado, FlujoTrabajo, PasoFlujo } from '../models/nutricion.models';
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
    private workflowService: WorkflowService
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
    this.pacienteSeleccionado = paciente;
    this.paciente.id = paciente.id;
    this.paciente.nombre = `${paciente.nombre} ${paciente.apellido}`;
    
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

  calcularPauta() {
    if (!this.paciente.peso || !this.paciente.altura || !this.pacienteSeleccionado) {
      alert('Por favor complete todos los campos del paciente y seleccione un paciente');
      return;
    }

    // Cálculo básico de TMB (Tasa Metabólica Basal)
    const peso = parseFloat(this.paciente.peso);
    const altura = parseFloat(this.paciente.altura);
    const edad = this.pacienteSeleccionado.edad;
    
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
  }

  guardarPauta() {
    if (this.pautaNutricional.calorias === 0 || !this.pacienteSeleccionado) {
      alert('Primero debe calcular la pauta nutricional');
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
    const menuSugerido = this.isAIEnabled ? this.generarMenuIA() : this.generarMenuBasico();
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
