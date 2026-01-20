import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService } from '../services/data.service';
import { VersionService, VersionType } from '../services/version.service';
import { Paciente, FlujoAsignado, FlujoTrabajo } from '../models/nutricion.models';
import { WorkflowService } from '../services/workflow.service';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pacientes.component.html',
  styleUrl: './pacientes.component.scss'
})
export class PacientesComponent implements OnInit {
  pacientes: Paciente[] = [];
  isAIEnabled = false;
  showAddForm = false;
  flujos: FlujoTrabajo[] = [];
  asignaciones: FlujoAsignado[] = [];
  pacienteParaFlujo: Paciente | null = null;
  flujoSeleccionadoId = '';
  modoSeleccionado: VersionType = 'sin-ia';
  comentarioAsignacion = '';
  
  nuevoPaciente = {
    nombre: '',
    apellido: '',
    edad: 0,
    telefono: '',
    email: '',
    activo: true
  };

  constructor(
    private dataService: DataService,
    private versionService: VersionService,
    private workflowService: WorkflowService
  ) {}

  ngOnInit() {
    this.dataService.pacientes$.subscribe(pacientes => {
      this.pacientes = pacientes;
    });

    this.versionService.version$.subscribe(version => {
      this.isAIEnabled = this.versionService.isAIEnabled();
    });

    this.workflowService.flujos$.subscribe(flujos => {
      this.flujos = flujos;
      if (!this.flujoSeleccionadoId && flujos.length > 0) {
        this.flujoSeleccionadoId = flujos[0].id;
      }
    });

    this.workflowService.asignaciones$.subscribe(asignaciones => {
      this.asignaciones = asignaciones;
    });
  }

  toggleAddForm() {
    this.showAddForm = !this.showAddForm;
    if (!this.showAddForm) {
      this.resetForm();
    }
  }

  agregarPaciente() {
    if (this.isFormValid()) {
      this.dataService.addPaciente(this.nuevoPaciente);
      this.resetForm();
      this.showAddForm = false;
    }
  }

  toggleEstadoPaciente(paciente: Paciente) {
    this.dataService.updatePaciente(paciente.id, { activo: !paciente.activo });
  }

  getHistorialPaciente(pacienteId: string) {
    const registros = this.dataService.getRegistrosByPaciente(pacienteId);
    const seguimientos = this.dataService.getSeguimientosByPaciente(pacienteId);
    return {
      totalConsultas: registros.length,
      ultimaConsulta: registros.length > 0 ? registros[0].fecha : null,
      promedioSatisfaccion: seguimientos.length > 0 
        ? seguimientos.reduce((sum, s) => sum + s.satisfaccion, 0) / seguimientos.length 
        : 0
    };
  }

  sugerirProximaPauta(pacienteId: string) {
    if (this.isAIEnabled) {
      const sugerencia = this.dataService.generarSugerenciaIA(pacienteId);
      alert('🤖 SUGERENCIA DE IA PARA PRÓXIMA PAUTA:\n\n' + sugerencia);
    }
  }

  abrirAsignacionFlujo(paciente: Paciente) {
    this.pacienteParaFlujo = paciente;
    const asignacionActual = this.getAsignacionActiva(paciente.id);
    this.modoSeleccionado = asignacionActual?.modoEjecutado || this.versionService.getCurrentVersion();
    this.flujoSeleccionadoId = asignacionActual?.flujoId || this.flujoSeleccionadoId || (this.flujos[0]?.id ?? '');
  }

  cancelarAsignacionFlujo() {
    this.pacienteParaFlujo = null;
    this.comentarioAsignacion = '';
  }

  asignarFlujo() {
    if (!this.pacienteParaFlujo || !this.flujoSeleccionadoId) {
      return;
    }

    this.workflowService.assignFlujoToPaciente(
      this.pacienteParaFlujo.id,
      this.flujoSeleccionadoId,
      this.modoSeleccionado
    );

    alert('✅ Flujo asignado correctamente.');
    this.cancelarAsignacionFlujo();
  }

  getAsignacionActiva(pacienteId: string): FlujoAsignado | undefined {
    return this.workflowService.getAsignacionActiva(pacienteId);
  }

  getNombreFlujo(flujoId: string): string {
    return this.flujos.find(f => f.id === flujoId)?.nombre ?? 'Flujo personalizado';
  }

  getTituloPasoActual(asignacion: FlujoAsignado): string {
    const flujo = this.flujos.find(f => f.id === asignacion.flujoId);
    if (!flujo) {
      return 'Sin referencia';
    }
    if (asignacion.estado === 'completado') {
      return 'Flujo completado';
    }

    const pasosOrdenados = [...flujo.pasos].sort((a, b) => a.orden - b.orden);
    const pasoActualId = asignacion.pasoActualId
      || pasosOrdenados.find(p => !asignacion.ejecucion.some(e => e.pasoId === p.id && e.fin))?.id
      || pasosOrdenados[0]?.id;

    const paso = pasosOrdenados.find(p => p.id === pasoActualId);
    return paso ? paso.titulo : 'Pendiente de inicio';
  }

  getFlujoSeleccionado(): FlujoTrabajo | undefined {
    return this.flujos.find(f => f.id === this.flujoSeleccionadoId);
  }

  getPasosOrdenados(flujo: FlujoTrabajo) {
    return [...flujo.pasos].sort((a, b) => a.orden - b.orden);
  }

  private isFormValid(): boolean {
    return this.nuevoPaciente.nombre.trim() !== '' &&
           this.nuevoPaciente.apellido.trim() !== '' &&
           this.nuevoPaciente.edad > 0 &&
           this.nuevoPaciente.telefono.trim() !== '' &&
           this.nuevoPaciente.email.trim() !== '';
  }

  private resetForm() {
    this.nuevoPaciente = {
      nombre: '',
      apellido: '',
      edad: 0,
      telefono: '',
      email: '',
      activo: true
    };
  }
}
