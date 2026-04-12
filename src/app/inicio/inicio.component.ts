import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataService } from '../services/data.service';
import { WorkflowService } from '../services/workflow.service';
import { ScenarioService, ScenarioDefinition } from '../services/scenario.service';
import { Paciente } from '../models/nutricion.models';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './inicio.component.html',
  styles: []
})
export class InicioComponent implements OnInit, OnDestroy {
  pacientes: Paciente[] = [];
  nextScenario: ScenarioDefinition | null = null;
  lastCompletedTitle: string | null = null;
  allScenariosCompleted = false;
  private scenarioSub: Subscription | null = null;

  constructor(
    private dataService: DataService,
    private workflowService: WorkflowService,
    private scenarioService: ScenarioService
  ) {}

  ngOnInit() {
    this.dataService.pacientes$.subscribe(pacientes => {
      this.pacientes = pacientes.filter(p => p.activo);
    });

    const ordered = this.scenarioService.getScenarios()
      .slice()
      .sort((a, b) => a.recommendedOrder - b.recommendedOrder);

    this.scenarioSub = this.scenarioService.scenarioStates$.subscribe(states => {
      const completed = ordered.filter(s => states[s.id] === 'completed');
      const pending = ordered.filter(s => states[s.id] !== 'completed');
      this.allScenariosCompleted = completed.length === ordered.length;
      this.nextScenario = pending[0] ?? null;
      this.lastCompletedTitle = completed.length > 0 ? completed[completed.length - 1].title : null;
    });
  }

  ngOnDestroy() {
    this.scenarioSub?.unsubscribe();
  }

  getPacientesSinFlujo(): Paciente[] {
    return this.pacientes.filter(p => !this.workflowService.getAsignacionActiva(p.id));
  }
}
