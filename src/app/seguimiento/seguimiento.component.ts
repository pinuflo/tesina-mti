import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService } from '../services/data.service';
import { VersionService } from '../services/version.service';
import { Paciente, RegistroNutricional, SeguimientoMensual, PautaNutricional, FlujoAsignado, FlujoTrabajo, PasoFlujo } from '../models/nutricion.models';
import { WorkflowService } from '../services/workflow.service';

@Component({
  selector: 'app-seguimiento',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './seguimiento.component.html',
  styleUrl: './seguimiento.component.scss'
})
export class SeguimientoComponent implements OnInit {
  isAIEnabled = false;
  pacienteSeleccionado: Paciente | null = null;
  pacientes: Paciente[] = [];
  registros: RegistroNutricional[] = [];
  seguimientos: SeguimientoMensual[] = [];
  pautas: PautaNutricional[] = [];
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
  
  constructor(
    private dataService: DataService,
    private versionService: VersionService,
    private route: ActivatedRoute,
    private workflowService: WorkflowService
  ) {}

  ngOnInit() {
    this.versionService.version$.subscribe(version => {
      this.isAIEnabled = this.versionService.isAIEnabled();
      this.prepararFeedbackBase();
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

  seleccionarPaciente(paciente: Paciente | string) {
    const pac = typeof paciente === 'string' 
      ? this.dataService.getPacienteById(paciente) 
      : paciente;
    
    if (pac) {
      this.pacienteSeleccionado = pac;
      this.cargarHistorial();
      this.actualizarFlujoParaPaciente(pac.id);
    }
  }

  cargarHistorial() {
    if (!this.pacienteSeleccionado) return;
    
    this.registros = this.dataService.getRegistrosByPaciente(this.pacienteSeleccionado.id);
    this.seguimientos = this.dataService.getSeguimientosByPaciente(this.pacienteSeleccionado.id);
    this.pautas = this.dataService.getPautasByPaciente(this.pacienteSeleccionado.id);
  }

  getEvolucionPeso(): { fechas: string[], pesos: number[] } {
    const fechas = this.registros.map(r => new Date(r.fecha).toLocaleDateString()).reverse();
    const pesos = this.registros.map(r => r.peso).reverse();
    return { fechas, pesos };
  }

  getPromedioSatisfaccion(): number {
    if (this.seguimientos.length === 0) return 0;
    return this.seguimientos.reduce((sum, s) => sum + s.satisfaccion, 0) / this.seguimientos.length;
  }

  getPromedioCumplimiento(): number {
    if (this.seguimientos.length === 0) return 0;
    const promedioDieta = this.seguimientos.reduce((sum, s) => sum + s.cumplimientoDieta, 0) / this.seguimientos.length;
    const promedioEjercicio = this.seguimientos.reduce((sum, s) => sum + s.cumplimientoEjercicio, 0) / this.seguimientos.length;
    return (promedioDieta + promedioEjercicio) / 2;
  }

  generarSugerenciaIA() {
    if (!this.pacienteSeleccionado || !this.isAIEnabled) return;
    
    const sugerencia = this.dataService.generarSugerenciaIA(this.pacienteSeleccionado.id);
    alert('🤖 SUGERENCIA PERSONALIZADA BASADA EN HISTORIAL:\n\n' + sugerencia);
  }

  agregarSeguimiento() {
    if (!this.pacienteSeleccionado) return;
    if (!this.flujoAsignado) {
      alert('Configura un protocolo en Inicio antes de agregar seguimientos.');
      return;
    }
    
    const ahora = new Date();
    const pesoActual = this.registros.length > 0 ? this.registros[0].peso : 70;
    
    const seguimiento: Omit<SeguimientoMensual, 'id'> = {
      pacienteId: this.pacienteSeleccionado.id,
      mes: ahora.getMonth() + 1,
      año: ahora.getFullYear(),
      pesoInicial: pesoActual,
      pesoFinal: pesoActual + (Math.random() * 2 - 1), // Simulación
      cumplimientoDieta: 70 + Math.floor(Math.random() * 30),
      cumplimientoEjercicio: 60 + Math.floor(Math.random() * 40),
      satisfaccion: 3 + Math.floor(Math.random() * 3),
      observaciones: 'Seguimiento registrado automáticamente',
      fecha: ahora
    };
    
    this.dataService.addSeguimiento(seguimiento);
    this.cargarHistorial();
    this.actualizarFlujoParaPaciente(this.pacienteSeleccionado.id);
    alert('✅ Seguimiento agregado exitosamente');
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
    const pendiente = this.pasosFlujo.find(paso => !this.flujoAsignado!.ejecucion.some(e => e.pasoId === paso.id && e.fin));
    this.pasoEnEjecucion = pasoActual || pendiente || null;
    this.prepararFeedbackBase();
  }

  private prepararFeedbackBase() {
    this.feedbackPaso = {
      facilidad: this.isAIEnabled ? 4 : 3,
      camposAutocompletados: this.isAIEnabled ? 5 : 0,
      camposManuales: this.isAIEnabled ? 2 : 6,
      comentarios: ''
    };
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
