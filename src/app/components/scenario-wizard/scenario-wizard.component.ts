import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScenarioService, ScenarioDefinition, ScenarioState } from '../../services/scenario.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-scenario-wizard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scenario-wizard.component.html',
  styleUrl: './scenario-wizard.component.scss'
})
export class ScenarioWizardComponent implements OnInit, OnDestroy {
  scenarios: ScenarioDefinition[] = [];
  scenarioStates: Record<string, ScenarioState> = {};
  currentScenario: ScenarioDefinition | null = null;
  visitId: string | null = null;
  completedVisits: string[] = [];
  loading = true;
  private lastVisitRoute: string | null = null;

  @Output() scenarioChange = new EventEmitter<boolean>();

  private subscriptions: Subscription[] = [];

  constructor(private scenarioService: ScenarioService, private router: Router) {}

  ngOnInit(): void {
    this.scenarios = this.scenarioService.getScenarios();
    this.subscriptions.push(
      this.scenarioService.scenarioStates$.subscribe(states => {
        this.scenarioStates = states;
      }),
      this.scenarioService.activeProgress$.subscribe(progress => {
        if (!progress) {
          this.currentScenario = null;
          this.visitId = null;
          this.completedVisits = [];
          this.scenarioChange.emit(false);
          this.lastVisitRoute = null;
        } else {
          this.currentScenario = this.scenarioService.getScenario(progress.scenarioId);
          this.visitId = progress.visitId;
          this.completedVisits = progress.completedVisits;
          this.scenarioChange.emit(true);
          this.navigateToCurrentVisit();
        }
        this.loading = false;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get currentVisit() {
    if (!this.currentScenario || !this.visitId) {
      return null;
    }
    return this.currentScenario.visits.find(v => v.id === this.visitId) || null;
  }

  startScenario(id: string) {
    this.scenarioService.startScenario(id as any);
    const scenario = this.scenarioService.getScenario(id as any);
    const firstRoute = scenario.visits[0]?.route;
    this.navigateToRoute(firstRoute);
  }

  resetScenario(id: string) {
    this.scenarioService.resetScenario(id as any);
  }

  resetAll() {
    this.scenarioService.resetAllScenarios();
  }

  isScenarioDisabled(id: string): boolean {
    if (!this.currentScenario) {
      return false;
    }
    return this.currentScenario.id !== id;
  }

  getStateClass(id: string): string {
    const state = this.scenarioStates[id];
    switch (state) {
      case 'completed':
        return 'state-completed';
      case 'in-progress':
        return 'state-active';
      default:
        return 'state-idle';
    }
  }

  private navigateToCurrentVisit(): void {
    const route = this.currentVisit?.route;
    this.navigateToRoute(route);
  }

  private navigateToRoute(route?: string): void {
    if (!route) {
      return;
    }
    if (this.lastVisitRoute === route) {
      return;
    }
    this.lastVisitRoute = route;
    this.router.navigate(['/', route]);
  }
}
