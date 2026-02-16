import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService } from '../services/data.service';
import { WorkflowService } from '../services/workflow.service';
import { Paciente } from '../models/nutricion.models';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './inicio.component.html',
  styles: []
})
export class InicioComponent implements OnInit {
  pacientes: Paciente[] = [];

  constructor(
    private dataService: DataService,
    private workflowService: WorkflowService
  ) {}

  ngOnInit() {
    this.dataService.pacientes$.subscribe(pacientes => {
      this.pacientes = pacientes.filter(p => p.activo);
    });
  }

  getPacientesSinFlujo(): Paciente[] {
    return this.pacientes.filter(p => !this.workflowService.getAsignacionActiva(p.id));
  }
}
