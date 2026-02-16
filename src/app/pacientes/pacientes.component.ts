import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService } from '../services/data.service';
import { VersionService } from '../services/version.service';
import { ScenarioService } from '../services/scenario.service';
import { Paciente } from '../models/nutricion.models';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pacientes.component.html',
  styleUrl: './pacientes.component.scss'
})
export class PacientesComponent implements OnInit {
  pacientes: Paciente[] = [];
  isAIEnabled = false;
  showAddForm = false;
  currentScenarioPatientId: string | null = null;
  currentScenarioPatientName: string | null = null;
  
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
    private scenarioService: ScenarioService,
    private router: Router
  ) {}

  ngOnInit() {
    this.dataService.pacientes$.subscribe(pacientes => {
      this.pacientes = pacientes;
    });

    this.versionService.version$.subscribe(() => {
      this.isAIEnabled = this.versionService.isAIEnabled();
    });

    this.scenarioService.activeProgress$.subscribe(progress => {
      if (!progress) {
        this.currentScenarioPatientId = null;
        this.currentScenarioPatientName = null;
        return;
      }
      const scenario = this.scenarioService.getScenario(progress.scenarioId);
      this.currentScenarioPatientId = scenario.patientId;
      this.currentScenarioPatientName = scenario.patientName;
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
    if (this.isPatientLocked(pacienteId)) {
      alert(this.buildLockMessage());
      return;
    }
    if (this.isAIEnabled) {
      const sugerencia = this.dataService.generarSugerenciaIA(pacienteId);
      alert('🤖 SUGERENCIA DE IA PARA PRÓXIMA PAUTA:\n\n' + sugerencia);
    }
  }

  handleProtectedNavigation(event: Event, paciente: Paciente, route: string) {
    if (this.isPatientLocked(paciente.id)) {
      event.preventDefault();
      event.stopPropagation();
      alert(this.buildLockMessage());
      return;
    }
    this.router.navigate([route], { queryParams: { pacienteId: paciente.id } });
  }

  isActiveScenarioPatient(pacienteId: string): boolean {
    return !!this.currentScenarioPatientId && this.currentScenarioPatientId === pacienteId;
  }

  isPatientLocked(pacienteId: string): boolean {
    return !!this.currentScenarioPatientId && this.currentScenarioPatientId !== pacienteId;
  }

  getPatientLockTooltip(pacienteId: string): string | null {
    return this.isPatientLocked(pacienteId) ? this.buildLockMessage() : null;
  }

  private buildLockMessage(): string {
    if (this.currentScenarioPatientName) {
      return `Completa el flujo en curso de ${this.currentScenarioPatientName} antes de cambiar de paciente.`;
    }
    return 'Completa el flujo en curso antes de cambiar de paciente.';
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
