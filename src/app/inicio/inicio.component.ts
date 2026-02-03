import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { VersionService } from '../services/version.service';
import { DataService } from '../services/data.service';
import { WorkflowService } from '../services/workflow.service';
import { Paciente, FlujoTrabajo, VersionMode, OrdenValidacion } from '../models/nutricion.models';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.scss'
})
export class InicioComponent implements OnInit {
  isAIEnabled = false;
  currentVersion = 'sin-ia';
  pacientes: Paciente[] = [];
  flujos: FlujoTrabajo[] = [];
  showWizard = false;
  wizard = {
    pacienteId: '',
    flujoId: '',
    modo: 'sin-ia' as VersionMode,
    orden: 'manual-primero' as OrdenValidacion,
    iteracionEtiqueta: ''
  };
  wizardError = '';

  constructor(
    private versionService: VersionService,
    private dataService: DataService,
    private workflowService: WorkflowService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.versionService.version$.subscribe(version => {
      this.isAIEnabled = this.versionService.isAIEnabled();
      this.currentVersion = version;
    });

    this.dataService.pacientes$.subscribe(pacientes => {
      this.pacientes = pacientes.filter(p => p.activo);
      if (!this.wizard.pacienteId && this.pacientes.length > 0) {
        this.wizard.pacienteId = this.pacientes[0].id;
      }
    });

    this.workflowService.flujos$.subscribe(flujos => {
      this.flujos = flujos;
      if (!this.wizard.flujoId && flujos.length > 0) {
        this.wizard.flujoId = flujos[0].id;
      }
    });

    this.route.queryParams.subscribe(params => {
      if (params['setupPatient']) {
        this.openWizard(params['setupPatient']);
      }
    });
  }

  openWizard(pacienteId?: string) {
    if (pacienteId) {
      this.wizard.pacienteId = pacienteId;
    }
    if (!this.wizard.flujoId && this.flujos.length > 0) {
      this.wizard.flujoId = this.flujos[0].id;
    }
    this.wizard.iteracionEtiqueta = this.buildIteracionEtiqueta();
    this.wizard.modo = this.currentVersion as VersionMode;
    this.wizard.orden = this.isAIEnabled ? 'ia-primero' : 'manual-primero';
    this.wizardError = '';
    this.showWizard = true;
  }

  closeWizard() {
    this.showWizard = false;
    this.router.navigate([], { queryParams: { setupPatient: null }, queryParamsHandling: 'merge' });
  }

  confirmWizard() {
    if (!this.wizard.pacienteId || !this.wizard.flujoId) {
      this.wizardError = 'Selecciona paciente y protocolo antes de continuar.';
      return;
    }

    const asignacion = this.workflowService.assignFlujoToPaciente(
      this.wizard.pacienteId,
      this.wizard.flujoId,
      this.wizard.modo,
      {
        ordenValidacion: this.wizard.orden,
        iteracionEtiqueta: this.wizard.iteracionEtiqueta
      }
    );

    if (asignacion) {
      alert('✅ Protocolo configurado. Puedes continuar con la evaluación.');
    }
    this.closeWizard();
  }

  getPacientesSinFlujo(): Paciente[] {
    return this.pacientes.filter(p => !this.workflowService.getAsignacionActiva(p.id));
  }

  getFlujoSeleccionado(): FlujoTrabajo | undefined {
    return this.flujos.find(f => f.id === this.wizard.flujoId);
  }

  private buildIteracionEtiqueta(): string {
    const total = this.workflowService.getAsignaciones().length + 1;
    return total < 10 ? `Iteración 0${total}` : `Iteración ${total}`;
  }
}
