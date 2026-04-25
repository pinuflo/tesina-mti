import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ScenarioService, ScenarioDefinition, ScenarioId, ScenarioState, ScenarioRunSummary, ScenarioVisit } from '../../services/scenario.service';
import { WorkflowService } from '../../services/workflow.service';
import { filter, Subscription } from 'rxjs';
import { NavigationEnd, Router } from '@angular/router';

type VisitStatus = 'completed' | 'in-progress' | 'not-started';

@Component({
  selector: 'app-scenario-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './scenario-wizard.component.html',
  styleUrl: './scenario-wizard.component.scss'
})
export class ScenarioWizardComponent implements OnInit, OnDestroy {
  scenarios: ScenarioDefinition[] = [];
  scenarioStates: Record<string, ScenarioState> = {};
  selectedScenarioId: ScenarioId | null = null;
  currentScenario: ScenarioDefinition | null = null;
  visitId: string | null = null;
  completedVisits: string[] = [];
  loading = true;
  summaries: ScenarioRunSummary[] = [];
  showCompletionModal = false;
  completionSummary: ScenarioRunSummary | null = null;
  completionTwinSummary: ScenarioRunSummary | null = null;

  // Likert per-visit modal
  showFacilityModal = false;
  facilityVisit: { id: string; title: string; pasoId: string } | null = null;
  facilityRating = 0;
  facilityComment = '';

  // SUS questionnaire
  showSusModal = false;
  susAnswers: number[] = new Array(10).fill(0);
  readonly susQuestions = [
    'Creo que me gustaría usar este sistema con frecuencia.',
    'Encontré el sistema innecesariamente complejo.',
    'Pensé que el sistema era fácil de usar.',
    'Creo que necesitaría el apoyo de un técnico para poder usar este sistema.',
    'Encontré que las diversas funciones del sistema estaban bien integradas.',
    'Pensé que había demasiada inconsistencia en este sistema.',
    'Imagino que la mayoría de las personas aprendería a usar este sistema muy rápidamente.',
    'Encontré el sistema muy incómodo de usar.',
    'Me sentí muy seguro/a usando el sistema.',
    'Necesité aprender muchas cosas antes de poder empezar a usar este sistema.'
  ];
  private facilityQueue: { id: string; title: string; pasoId: string }[] = [];
  private blockCompletionModal = false;
  private prevCompletedVisits: string[] = [];
  private lastKnownScenario: ScenarioDefinition | null = null;

  private summaryByScenarioId: Partial<Record<ScenarioId, ScenarioRunSummary>> = {};
  private pendingCompletedScenarioId: ScenarioId | null = null;
  private lastActiveScenarioId: ScenarioId | null = null;
  private lastCompletionSignature: string | null = null;
  private currentRouteModule = '';
  private lastVisitRoute: string | null = null;
  private scenarioStartedAt: string | null = null;
  private nowTick = Date.now();
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  @Output() scenarioChange = new EventEmitter<boolean>();
  @Output() readyForNext = new EventEmitter<void>();

  private subscriptions: Subscription[] = [];

  constructor(private scenarioService: ScenarioService, private router: Router, private workflowService: WorkflowService) {}

  ngOnInit(): void {
    this.scenarios = this.scenarioService.getScenarios();
    this.selectedScenarioId = null;
    this.currentRouteModule = this.getRouteModule(this.router.url);
    this.subscriptions.push(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(event => {
          this.currentRouteModule = this.getRouteModule(event.urlAfterRedirects || event.url);
        }),
      this.scenarioService.scenarioStates$.subscribe(states => {
        this.scenarioStates = states;
        this.tryOpenCompletionModal();
      }),
      this.scenarioService.activeProgress$.subscribe(progress => {
        if (!progress) {
          // Detect last-visit completion before clearing state.
          // Only push to facilityQueue if the scenario actually finished (not cancelled).
          if (
            this.lastKnownScenario &&
            this.lastActiveScenarioId &&
            this.scenarioStates[this.lastActiveScenarioId] === 'completed' &&
            this.prevCompletedVisits.length < this.lastKnownScenario.visits.length
          ) {
            const lastVisit = this.lastKnownScenario.visits[this.lastKnownScenario.visits.length - 1];
            const pasoId = lastVisit?.completionPasoIds?.[0] ?? lastVisit.id;
            this.facilityQueue.push({ id: lastVisit.id, title: lastVisit.title, pasoId });
            this.blockCompletionModal = true;
          }
          this.prevCompletedVisits = [];

          this.currentScenario = null;
          this.visitId = null;
          this.completedVisits = [];
          this.scenarioStartedAt = null;
          this.scenarioChange.emit(false);
          this.lastVisitRoute = null;
          this.stopTimer();

          if (this.lastActiveScenarioId && this.scenarioStates[this.lastActiveScenarioId] === 'completed') {
            this.pendingCompletedScenarioId = this.lastActiveScenarioId;
            if (!this.blockCompletionModal) {
              this.tryOpenCompletionModal();
            } else if (!this.showFacilityModal) {
              this.showNextFacilityModal();
            }
          } else if (!this.lastKnownScenario) {
            // Initial load / page refresh with no in-session scenario
            setTimeout(() => this.readyForNext.emit(), 0);
          } else if (this.lastActiveScenarioId) {
            // Scenario was cancelled (not completed)
            setTimeout(() => this.readyForNext.emit(), 0);
          }

          this.lastActiveScenarioId = null;
        } else {
          this.currentScenario = this.scenarioService.getScenario(progress.scenarioId);
          this.lastKnownScenario = this.currentScenario;

          // Detect newly completed visits for Likert queue
          const newlyCompleted = progress.completedVisits.filter(vId => !this.prevCompletedVisits.includes(vId));
          if (newlyCompleted.length > 0) {
            for (const visitId of newlyCompleted) {
              const visit = this.currentScenario.visits.find(v => v.id === visitId);
              const pasoId = visit?.completionPasoIds?.[0] ?? visitId;
              if (visit) {
                this.facilityQueue.push({ id: visitId, title: visit.title, pasoId });
              }
            }
            if (!this.showFacilityModal) {
              this.showNextFacilityModal();
            }
          }
          this.prevCompletedVisits = [...progress.completedVisits];

          this.visitId = progress.visitId;
          this.completedVisits = progress.completedVisits;
          this.scenarioStartedAt = progress.startedAt;
          this.scenarioChange.emit(true);
          this.lastActiveScenarioId = progress.scenarioId;
          this.startTimer();
          this.navigateToCurrentVisit();
        }
        this.loading = false;
      }),
      this.scenarioService.scenarioSummaries$.subscribe(records => {
        this.summaryByScenarioId = {};
        (Object.keys(records) as ScenarioId[]).forEach(id => {
          const summary = records[id];
          if (summary) {
            this.summaryByScenarioId[id] = summary;
          }
        });

        this.summaries = Object.values(records)
          .filter((summary): summary is ScenarioRunSummary => !!summary)
          .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime());

        this.tryOpenCompletionModal();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.stopTimer();
  }

  get elapsedScenarioTime(): string {
    if (!this.scenarioStartedAt) {
      return '';
    }

    const startedAtMs = new Date(this.scenarioStartedAt).getTime();
    if (!Number.isFinite(startedAtMs)) {
      return '';
    }

    const elapsedMs = Math.max(0, this.nowTick - startedAtMs);
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${this.pad2(hours)}:${this.pad2(minutes)}:${this.pad2(seconds)}`;
    }
    return `${this.pad2(minutes)}:${this.pad2(seconds)}`;
  }

  get currentVisit() {
    if (!this.currentScenario) {
      return null;
    }

    const activeVisitId = this.getActiveVisitId();
    if (!activeVisitId) {
      return null;
    }

    return this.currentScenario.visits.find(v => v.id === activeVisitId) || null;
  }

  isVisitActive(visit: ScenarioVisit): boolean {
    return visit.id === this.getActiveVisitId();
  }

  getVisitStatus(visit: ScenarioVisit): VisitStatus {
    if (this.completedVisits.includes(visit.id)) {
      return 'completed';
    }

    if (this.isVisitActive(visit)) {
      return 'in-progress';
    }

    return 'not-started';
  }

  getVisitStatusLabel(visit: ScenarioVisit): string {
    const status = this.getVisitStatus(visit);
    if (status === 'completed') {
      return 'Completada';
    }
    if (status === 'in-progress') {
      return 'En curso';
    }
    return 'No empezada';
  }

  getVisitStatusIcon(visit: ScenarioVisit): string {
    const status = this.getVisitStatus(visit);
    if (status === 'completed') {
      return 'fas fa-check-circle';
    }
    if (status === 'in-progress') {
      return 'fas fa-play-circle';
    }
    return 'far fa-circle';
  }

  getCurrentPhaseTitle(): string {
    return this.currentVisit?.title || 'Flujo finalizado';
  }

  getCurrentPhaseStatusLabel(): string {
    if (!this.currentVisit) {
      return 'Completada';
    }
    return this.getVisitStatusLabel(this.currentVisit);
  }

  getCurrentPhaseStatusClass(): string {
    if (!this.currentVisit) {
      return 'status-completed';
    }
    return `status-${this.getVisitStatus(this.currentVisit)}`;
  }

  startScenario(id: string) {
    this.scenarioService.startScenario(id as any);
    const scenario = this.scenarioService.getScenario(id as any);
    const firstRoute = scenario.visits[0]?.route;
    this.navigateToRoute(firstRoute);
  }

  selectScenarioCard(id: ScenarioId): void {
    this.selectedScenarioId = id;
  }

  isScenarioExpanded(id: ScenarioId): boolean {
    return this.selectedScenarioId === id;
  }

  getScenarioCompactMeta(scenario: ScenarioDefinition): string {
    const fases = `${scenario.visits.length} fases`;
    const tiempos = `${scenario.requiredMealTimes} tiempos de comida`;
    const modo = scenario.mode === 'con-ia' ? 'asistido' : 'manual';
    return `${fases} · ${tiempos} · flujo ${modo}`;
  }

  getScenarioInstructionHighlights(scenario: ScenarioDefinition): string[] {
    const highlights = scenario.visits.map(visit => {
      const principal = visit.instructions[0] || visit.expectedOutcome;
      return `${visit.title}: ${principal}`;
    });

    highlights.push(
      scenario.requiredMealTimes === 3
        ? 'Cierre nutricional: completar 3 tiempos (desayuno, almuerzo y cena).'
        : 'Cierre nutricional: completar 5 tiempos (incluye colaciones).'
    );

    return highlights;
  }

  resetScenario(id: string) {
    this.scenarioService.resetScenario(id as any);
  }

  resetAll() {
    const confirmed = window.confirm(
      '¿Seguro que deseas reiniciar todo? Se eliminarán todos los datos capturados del estudio (tiempos, clicks, facilidad).'
    );
    if (!confirmed) return;
    this.scenarioService.resetAllScenarios();
    localStorage.removeItem('sus_results');
    this.closeCompletionModal();
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

  get scenarioGroups(): { label: string; scenarios: ScenarioDefinition[] }[] {
    const all = this.scenarios;
    const groupA = all.filter(s => s.id === 'A1' || s.id === 'A2');
    const groupB = all.filter(s => s.id === 'B1' || s.id === 'B2');
    return [
      { label: `Par A — ${groupA[0]?.patientName ?? ''}`, scenarios: groupA },
      { label: `Par B — ${groupB[0]?.patientName ?? ''}`, scenarios: groupB }
    ];
  }

  get allScenariosCompleted(): boolean {
    return this.scenarios.every(s => this.scenarioStates[s.id] === 'completed');
  }

  get hasSomeProgress(): boolean {
    return Object.values(this.scenarioStates).some(s => s !== 'idle');
  }

  getTwinState(scenarioId: ScenarioId): { id: ScenarioId; title: string; state: string } | null {
    const twin = this.getTwinScenarioId(scenarioId);
    if (!twin) return null;
    const scenario = this.scenarios.find(s => s.id === twin);
    if (!scenario) return null;
    const state = this.scenarioStates[twin];
    return {
      id: twin,
      title: scenario.title,
      state: state === 'completed' ? 'Completado' : state === 'in-progress' ? 'En curso' : 'Pendiente'
    };
  }

  get hasSummaries(): boolean {
    return this.summaries.length > 0;
  }

  get completedCount(): number {
    return this.scenarios.filter(s => this.scenarioStates[s.id] === 'completed').length;
  }

  isNextScenario(id: ScenarioId): boolean {
    const sorted = [...this.scenarios].sort((a, b) => a.recommendedOrder - b.recommendedOrder);
    const next = sorted.find(s => this.scenarioStates[s.id] === 'idle');
    return next?.id === id;
  }

  get liveClickCount(): number {
    void this.nowTick; // access nowTick so change detection re-evaluates this getter each tick
    return this.scenarioService.getActiveClickCount();
  }

  getScenarioSummary(id: ScenarioId): ScenarioRunSummary | null {
    return this.summaryByScenarioId[id] || null;
  }

  // ── Likert facility modal ────────────────────────────────────────────────
  showNextFacilityModal(): void {
    if (this.facilityQueue.length === 0) {
      this.blockCompletionModal = false;
      this.tryOpenCompletionModal();
      return;
    }
    this.facilityVisit = this.facilityQueue.shift()!;
    this.facilityRating = 0;
    this.facilityComment = '';
    this.showFacilityModal = true;
  }

  submitFacilityRating(): void {
    if (this.facilityVisit && this.lastKnownScenario && this.facilityRating > 0) {
      const asignacionId = this.scenarioService.getLatestAssignmentId(
        this.lastKnownScenario.patientId,
        this.lastKnownScenario.flujoId
      );
      if (asignacionId) {
        this.workflowService.registrarFacilidad(
          asignacionId,
          this.facilityVisit.pasoId,
          this.facilityRating,
          this.facilityComment || undefined
        );
      }
    }
    this.closeFacilityModal();
  }

  skipFacilityRating(): void {
    this.closeFacilityModal();
  }

  private closeFacilityModal(): void {
    this.facilityVisit = null;
    this.showFacilityModal = false;
    this.facilityRating = 0;
    this.facilityComment = '';
    this.showNextFacilityModal();
  }

  setFacilityRating(value: number): void {
    this.facilityRating = value;
  }

  getFacilityStars(): number[] {
    return [1, 2, 3, 4, 5];
  }

  // ── Visit helpers ────────────────────────────────────────────────────────
  getVisitActionHint(visitId: string): string {
    if (!this.currentScenario) {
      return 'Completa las acciones en el módulo indicado para avanzar al siguiente paso.';
    }
    const name = this.currentScenario.patientName;
    const ia = this.currentScenario.mode === 'con-ia';
    switch (visitId) {
      case 'visita_1':
        return `Selecciona a ${name} en el módulo Pacientes y completa los datos antropométricos y nivel de actividad.`;
      case 'visita_2':
        return `En Evaluación → Subpaso 1, calcula ${ia ? 'y valida las' : 'la'} TMB y calorías objetivo${ia ? ' sugeridas por IA' : ''}.`;
      case 'visita_3':
        return `En Evaluación → Subpaso 1, define la distribución de macros diarios${ia ? ' con asistencia IA' : ''} y confirma el resultado.`;
      case 'visita_4':
        return `En Evaluación → Subpaso 2, arma la pauta semanal${ia ? ', revisa el menú IA,' : ','} asigna porciones y guarda la pauta final.`;
      default:
        return 'Completa las acciones en el módulo indicado para avanzar al siguiente paso.';
    }
  }

  goToCurrentModule(): void {
    const route = this.currentVisit?.route;
    if (route) {
      this.lastVisitRoute = null;
      this.navigateToRoute(route);
    }
  }

  getVisitLabel(visitId: string): string {
    if (!this.completionSummary) return visitId.toUpperCase();
    const scenario = this.scenarioService.getScenario(this.completionSummary.scenarioId);
    return scenario?.visits.find(v => v.id === visitId)?.title ?? visitId.toUpperCase();
  }

  closeCompletionModal(): void {
    this.showCompletionModal = false;
    this.completionSummary = null;
    this.completionTwinSummary = null;
    const completedCount = Object.values(this.scenarioStates).filter(s => s === 'completed').length;
    const susDone = !!localStorage.getItem('sus_results');
    if (completedCount === 4 && !susDone) {
      this.showSusModal = true;
      return;
    }
    this.readyForNext.emit();
    this.router.navigate(['/']);
  }

  setSusAnswer(index: number, value: number): void {
    const copy = [...this.susAnswers];
    copy[index] = value;
    this.susAnswers = copy;
  }

  get susFormValid(): boolean {
    return this.susAnswers.every(a => a >= 1 && a <= 5);
  }

  getSusScore(): number {
    let total = 0;
    for (let i = 0; i < 10; i++) {
      total += i % 2 === 0 ? (this.susAnswers[i] - 1) : (5 - this.susAnswers[i]);
    }
    return total * 2.5;
  }

  getSusLabel(score: number): string {
    if (score >= 85) return 'Excelente';
    if (score >= 71) return 'Bueno';
    if (score >= 52) return 'Promedio';
    return 'Deficiente';
  }

  submitSus(): void {
    const score = this.getSusScore();
    localStorage.setItem('sus_results', JSON.stringify({
      answers: [...this.susAnswers],
      score,
      label: this.getSusLabel(score),
      completedAt: new Date().toISOString()
    }));
    this.showSusModal = false;
    this.susAnswers = new Array(10).fill(0);
    this.readyForNext.emit();
    this.router.navigate(['/analisis']);
  }

  skipSus(): void {
    this.showSusModal = false;
    this.readyForNext.emit();
    this.router.navigate(['/']);
  }

  triggerQuickExport(): void {
    const summaries = Object.values(this.summaryByScenarioId).filter(Boolean);
    const payload = { exportedAt: new Date().toISOString(), type: 'quick-backup', scenarios: summaries };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-sesion-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  get completionTwinLabel(): string {
    if (!this.completionTwinSummary) {
      return 'Escenario gemelo';
    }
    return this.completionTwinSummary.scenarioTitle;
  }

  get timeDeltaVsTwin(): number | null {
    if (!this.completionSummary || !this.completionTwinSummary) {
      return null;
    }

    if (typeof this.completionSummary.tiempoTotalMin !== 'number' || typeof this.completionTwinSummary.tiempoTotalMin !== 'number') {
      return null;
    }

    return this.completionTwinSummary.tiempoTotalMin - this.completionSummary.tiempoTotalMin;
  }

  get facilidadDeltaVsTwin(): number | null {
    if (!this.completionSummary || !this.completionTwinSummary) {
      return null;
    }

    if (typeof this.completionSummary.facilidadPromedio !== 'number' || typeof this.completionTwinSummary.facilidadPromedio !== 'number') {
      return null;
    }

    return this.completionSummary.facilidadPromedio - this.completionTwinSummary.facilidadPromedio;
  }

  get clicksDeltaVsTwin(): number | null {
    if (!this.completionSummary || !this.completionTwinSummary) {
      return null;
    }
    if (typeof this.completionSummary.interaccionesTotal !== 'number' || typeof this.completionTwinSummary.interaccionesTotal !== 'number') {
      return null;
    }
    // positive = this scenario had fewer clicks (better)
    return this.completionTwinSummary.interaccionesTotal - this.completionSummary.interaccionesTotal;
  }

  get hasTwinComparison(): boolean {
    return !!this.completionSummary && !!this.completionTwinSummary;
  }

  private tryOpenCompletionModal(): void {
    if (this.blockCompletionModal) {
      return;
    }
    if (!this.pendingCompletedScenarioId) {
      return;
    }

    const summary = this.summaryByScenarioId[this.pendingCompletedScenarioId];
    if (!summary) {
      return;
    }

    const signature = `${summary.scenarioId}|${summary.finishedAt}`;
    if (signature === this.lastCompletionSignature) {
      this.pendingCompletedScenarioId = null;
      return;
    }

    const twinId = this.getTwinScenarioId(summary.scenarioId);
    this.completionSummary = summary;
    this.completionTwinSummary = twinId ? this.summaryByScenarioId[twinId] || null : null;
    this.showCompletionModal = true;
    this.lastCompletionSignature = signature;
    this.pendingCompletedScenarioId = null;
  }

  private getTwinScenarioId(id: ScenarioId): ScenarioId | null {
    switch (id) {
      case 'A1':
        return 'A2';
      case 'A2':
        return 'A1';
      case 'B1':
        return 'B2';
      case 'B2':
        return 'B1';
      default:
        return null;
    }
  }

  private getRouteModule(url: string): string {
    const clean = (url || '').split('?')[0].replace(/^\//, '');
    return clean.split('/')[0] || '';
  }

  private getActiveVisitId(): string | null {
    if (!this.currentScenario) {
      return null;
    }

    const pendingSequential = this.currentScenario.visits.find(v => !this.completedVisits.includes(v.id));
    if (pendingSequential) {
      return pendingSequential.id;
    }

    if (this.currentScenario.visits.length > 0) {
      return this.currentScenario.visits[this.currentScenario.visits.length - 1].id;
    }

    if (this.visitId) {
      const visitById = this.currentScenario.visits.find(v => v.id === this.visitId);
      if (visitById && (!this.currentRouteModule || visitById.route === this.currentRouteModule)) {
        return visitById.id;
      }
    }

    const sameRouteVisits = this.currentScenario.visits.filter(v => v.route === this.currentRouteModule);
    if (sameRouteVisits.length > 0) {
      const pendingInRoute = sameRouteVisits.find(v => !this.completedVisits.includes(v.id));
      return (pendingInRoute || sameRouteVisits[sameRouteVisits.length - 1]).id;
    }

    return this.visitId;
  }

  private startTimer(): void {
    if (this.timerHandle) {
      return;
    }

    this.nowTick = Date.now();
    this.timerHandle = setInterval(() => {
      this.nowTick = Date.now();
    }, 1000);
  }

  private stopTimer(): void {
    if (!this.timerHandle) {
      return;
    }

    clearInterval(this.timerHandle);
    this.timerHandle = null;
  }

  private pad2(value: number): string {
    return value.toString().padStart(2, '0');
  }
}
